#!/usr/bin/env node
/**
 * Poller: menu_reports(status='new') -> gemma4:e4b vision -> suggested_menu_md.
 *
 * Runs on the Mac (Vercel can't reach localhost Ollama). Single run: processes
 * all pending reports then exits. Schedule every 5 min via cron (see README line below).
 * Cron example — run every 5 minutes, append to log:
 *   cd /Volumes/2TBSSD/anilexternal/Documents/Explores_Berlin && node scripts/process_reports.js
 *
 * Flow per report:
 *   photo  -> JPEG (HEIC convert) -> base64 -> Ollama gemma4:e4b (same PROMPT as
 *             rag-eg2/extract.py + reporter note + current menu_md)
 *          -> clean_table() -> suggested_menu_md, status='suggested' + Telegram preview
 *   no photo -> status='text-only' (human decides: clear menu? close place?)
 *
 * Usage: node scripts/process_reports.js [--limit N] [--id ID]
 */
const path = require("path");
const { execFileSync } = require("child_process");
const os = require("os");
const fs = require("fs");
const { Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const args = process.argv.slice(2);
const li = args.indexOf("--limit");
const LIMIT = li >= 0 && args[li + 1] ? parseInt(args[li + 1], 10) : 10;
const ii = args.indexOf("--id");
const ONLY_ID = ii >= 0 && args[ii + 1] ? parseInt(args[ii + 1], 10) : null;
const DRY_RUN = args.includes("--dry-run"); // vision runs, prints table, writes nothing
const FORCE = args.includes("--force"); // with --id: reprocess regardless of status

const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const VLM_MODEL = process.env.VLM_MODEL || "gemma4:e4b";
const VLM_CTX = parseInt(process.env.VLM_CTX || "16384", 10);
const VLM_PREDICT = parseInt(process.env.VLM_PREDICT || "4096", 10);
const VLM_THINK = (process.env.VLM_THINK || "false").toLowerCase() === "true";
// VLM_PROVIDER=local (Ollama, free, weak on dense boards), cloud (NVIDIA NIM
// vision), zen (OpenCode inference API key) or opencode (opencode CLI run —
// headless, uses OpenCode auth incl. free tier; best quality so far).
const VLM_PROVIDER = (process.env.VLM_PROVIDER || "opencode").toLowerCase();
const VLM_CLOUD_MODEL = process.env.VLM_CLOUD_MODEL || "nvidia/ising-calibration-1.5-31b";
const OPENCODE_MODEL = process.env.OPENCODE_MODEL || "opencode/muse-spark-1.3-contributor-free";
const OPENCODE_BIN = process.env.OPENCODE_BIN || "opencode";
const ZEN_API = process.env.OPENCODE_API_URL || "https://opencode.ai/inference/v1";
const ZEN_MODEL = process.env.ZEN_MODEL || "muse-spark-1.3-contributor-free";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

// Same extraction prompt as rag-eg2/extract.py, plus report context appended per-report.
const BASE_PROMPT = `Transcribe this restaurant menu image into a markdown table.

| Item | Price |
|------|-------|

Rules:
- One row per dish or drink that shows a price, in the original menu order.
- Price format: German, e.g. 8,50 € (comma decimal, space before €).
- The price is the RIGHTMOST amount on the line (often written "-- 12,50").
  Volumes like 0,33L, 0,5L, 0,75L, 1L are NOT prices — never output a volume
  as a price. If you cannot find a real price for an item, write ?.
- Keep item names in the language printed on the menu.
- Drop allergen superscripts, portion codes, "Produktinfo", logos, QR codes,
  addresses and opening hours.
- If a price is unreadable write ? instead of guessing.
- NEVER output section/category headers (COCKTAILS, BEER, WINE, SOFT DRINKS…)
  as rows — headers are not dishes, skip them entirely.
- A ? price is only allowed for a real dish or drink whose name you can read
  clearly. If a line has no readable item name, skip it, do not emit it.
- Never use bold (**) or any other markdown formatting inside the table.
- Output the table directly with no analysis.
- Output only the markdown table. No commentary, no code fences.`;

function normPrice(raw) {
    let p = String(raw).replace(/\s+/g, " ").trim();
    if (p === "?" || p === "") return "?";
    let m = p.match(/^€\s*(\d{1,3}),(\d{1,2})$/);
    if (m) return `${m[1]},${m[2].padEnd(2, "0")} €`;
    m = p.match(/^(ab\s+)?(\d{1,3})[,.](\d{2})\s*€$/);
    if (m) return `${m[1] || ""}${m[2]},${m[3]} €`;
    m = p.match(/^(\d{1,3})\s*€$/);
    if (m) return `${m[1]},00 €`;
    return null;
}

function cleanTable(raw) {
    const text = String(raw || "").replace(/```/g, "");
    const lines = text.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim().startsWith("|"));
    if (lines.length < 3) return null;
    let rows = [];
    for (const ln of lines) {
        if (ln.includes("**")) continue; // bold = section header artifact, never a dish
        const cells = ln.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (cells.length < 2) continue;
        const [item, price] = cells;
        if (/^[-:\s]+$/.test(item) || /^[-:\s]+$/.test(price)) continue;
        if (item.toLowerCase() === "item" && price.toLowerCase() === "price") {
            rows = ["| Item | Price |", "|------|-------|"];
            continue;
        }
        const norm = normPrice(price.replace(/\s+/g, " "));
        if (norm === null) continue;
        const cleanItem = item.replace(/\s+/g, " ").trim();
        if (cleanItem) rows.push(`| ${cleanItem} | ${norm} |`);
    }
    if (rows.length < 3) return null;
    // dedup: menus repeat the same board; keep first occurrence of identical rows
    const seen = new Set();
    const deduped = [];
    for (const r of rows) {
        if (!r.startsWith("| Item")) {
            const key = r.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
        }
        deduped.push(r);
    }
    return deduped.join("\n");
}

function countRows(table) {
    if (!table) return 0;
    return table.split("\n").filter((l) => {
        const t = l.trim();
        if (!t.startsWith("|")) return false;
        const cells = t.split("|").map((c) => c.trim()).filter(Boolean);
        if (cells.length < 2) return false;
        if (/^item$/i.test(cells[0])) return false;
        if (/^[-:\s]+$/.test(cells[0])) return false;
        return true;
    }).length;
}

function isHeic(buf, mime, name) {
    if (/heic|heif/i.test(mime || "") || /\.hei[c|f]$/i.test(name || "")) return true;
    // ftyp box check: ....ftypheic / ftypheix / ftypmif1
    if (buf && buf.length > 12) {
        const box = buf.subarray(4, 12).toString("ascii");
        if (box.startsWith("ftyp") && /heic|heix|hevc|hevx|mif1/.test(buf.subarray(8, 16).toString("ascii"))) return true;
    }
    return false;
}

async function toJpeg(buf) {
    try {
        const sharp = (await import("sharp")).default;
        return await sharp(buf).jpeg({ quality: 88 }).toBuffer();
    } catch (e) {
        console.log(`  sharp convert failed (${e.message.split("\n")[0]}), trying sips…`);
    }
    // macOS fallback
    const tmpIn = path.join(os.tmpdir(), `rep_${Date.now()}.heic`);
    const tmpOut = path.join(os.tmpdir(), `rep_${Date.now()}.jpg`);
    fs.writeFileSync(tmpIn, buf);
    try {
        execFileSync("sips", ["-s", "format", "jpeg", tmpIn, "--out", tmpOut], { stdio: "pipe" });
        return fs.readFileSync(tmpOut);
    } finally {
        try { fs.unlinkSync(tmpIn); } catch {}
        try { fs.unlinkSync(tmpOut); } catch {}
    }
}

// Normalize orientation via EXIF transpose AND strip the EXIF tag, so every
// downstream reader sees identical upright pixels (a leftover orientation tag
// makes some readers rotate a second time). PIL-based: deterministic.
async function normalizeOrientation(jpegBuf) {
    const { execFileSync } = require("child_process");
    const tmpIn = path.join(os.tmpdir(), `nrm_${Date.now()}.jpg`);
    fs.writeFileSync(tmpIn, jpegBuf);
    try {
        const out = execFileSync("python3", ["-c",
            "import sys;from PIL import Image,ImageOps;" +
            "im=Image.open(sys.argv[1]);im=ImageOps.exif_transpose(im);" +
            "im.save(sys.argv[2],'JPEG',quality=90)",
            tmpIn, tmpIn + ".out.jpg"], { encoding: "utf8", timeout: 60000 });
        return fs.readFileSync(tmpIn + ".out.jpg");
    } catch (e) {
        console.log(`  PIL normalize failed (${String(e.message).split("\n")[0]}), trying sharp…`);
        try {
            const sharp = (await import("sharp")).default;
            return await sharp(jpegBuf).rotate().jpeg({ quality: 90 }).toBuffer();
        } catch (e2) {
            console.log("  orientation normalize skipped");
            return jpegBuf;
        }
    } finally {
        try { fs.unlinkSync(tmpIn); } catch {}
        try { fs.unlinkSync(tmpIn + ".out.jpg"); } catch {}
    }
}

// Split board into 2x2 overlapping crops so small print stays legible.
async function makeCrops(jpegBuf) {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(jpegBuf).metadata();
    const W = meta.width, H = meta.height;
    const boxes = [
        { left: 0, top: 0, width: Math.ceil(W * 0.55), height: Math.ceil(H * 0.55) },
        { left: Math.floor(W * 0.45), top: 0, width: W - Math.floor(W * 0.45), height: Math.ceil(H * 0.55) },
        { left: 0, top: Math.floor(H * 0.45), width: Math.ceil(W * 0.55), height: H - Math.floor(H * 0.45) },
        { left: Math.floor(W * 0.45), top: Math.floor(H * 0.45), width: W - Math.floor(W * 0.45), height: H - Math.floor(H * 0.45) },
    ];
    const out = [];
    for (const b of boxes) {
        out.push(await sharp(jpegBuf).extract(b).jpeg({ quality: 90 }).toBuffer());
    }
    return out;
}

function mergeCropTables(tables) {
    const seen = new Set();
    const merged = ["| Item | Price |", "|------|-------|"];
    for (const t of tables) {
        if (!t) continue;
        for (const ln of t.split("\n").slice(2)) {
            const key = ln.trim().toLowerCase();
            if (!key.startsWith("|") || seen.has(key)) continue;
            seen.add(key);
            merged.push(ln.trim());
        }
    }
    return merged.length > 2 ? merged.join("\n") : null;
}

async function askVlm(jpegBuf, extraContext) {
    const content = extraContext ? `${BASE_PROMPT}\n\n${extraContext}` : BASE_PROMPT;
    if (VLM_PROVIDER === "cloud") return askVlmCloud(jpegBuf, content);
    if (VLM_PROVIDER === "zen") return askVlmZen(jpegBuf, content);
    if (VLM_PROVIDER === "opencode") return askVlmOpencode(jpegBuf, content);
    // local path: downscale for speed/context
    const sharp = (await import("sharp")).default;
    const small = await sharp(jpegBuf).resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    const res = await fetch(`${OLLAMA}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: VLM_MODEL,
            stream: false,
            think: VLM_THINK,
            messages: [{ role: "user", content, images: [small.toString("base64")] }],
            options: { temperature: 0, num_ctx: VLM_CTX, num_predict: VLM_PREDICT },
        }),
        signal: AbortSignal.timeout(1200_000),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.message?.content || "";
}

async function askVlmOpencode(jpegBuf, content) {
    // Headless opencode run: image must live inside the workspace (/tmp is blocked).
    const { execFileSync } = require("child_process");
    const dir = path.join(__dirname, "..", "tmp_reports");
    fs.mkdirSync(dir, { recursive: true });
    const imgPath = path.join(dir, `rep_${Date.now()}.jpg`);
    try {
        fs.writeFileSync(imgPath, jpegBuf);
        const rel = path.relative(path.join(__dirname, ".."), imgPath);
        const out = execFileSync(
            OPENCODE_BIN,
            ["run", `${content}\n\nMenu photo: ${rel} — it is already upright, do not rotate it. ` +
             `Read only this file and work only inside the project directory.`,
             "-m", OPENCODE_MODEL],
            { encoding: "utf8", timeout: 600_000, maxBuffer: 4 * 1024 * 1024 }
        );
        return out;
    } finally {
        try { fs.unlinkSync(imgPath); } catch {}
    }
}

async function askVlmZen(jpegBuf, content) {
    const key = process.env.OPENCODE_API_KEY;
    if (!key) throw new Error("OPENCODE_API_KEY missing for zen VLM");
    const res = await fetch(`${ZEN_API}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: ZEN_MODEL,
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: content },
                    { type: "image_url", image_url: { url: "data:image/jpeg;base64," + jpegBuf.toString("base64") } },
                ],
            }],
            temperature: 0,
            max_tokens: 4000,
        }),
        signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) throw new Error(`zen ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
}

async function askVlmCloud(jpegBuf, content) {
    const key = process.env.NVIDIA_API_KEY;
    if (!key) throw new Error("NVIDIA_API_KEY missing for cloud VLM");
    const callOne = async (b64, extra) => {
        const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: VLM_CLOUD_MODEL,
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: extra ? `${content}\n\n${extra}` : content },
                        { type: "image_url", image_url: { url: "data:image/jpeg;base64," + b64 } },
                    ],
                }],
                temperature: 0,
                max_tokens: 3000,
            }),
            signal: AbortSignal.timeout(600_000),
        });
        if (!res.ok) throw new Error(`nvidia ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
    };
    // Dense boards: 2x2 overlapping crops keep small print legible.
    let crops = null;
    try {
        crops = await makeCrops(jpegBuf);
    } catch (e) {
        console.log(`  crop failed (${e.message.split("\n")[0]}), single-shot`);
    }
    if (!crops) return callOne(jpegBuf.toString("base64"));
    const tables = [];
    for (let i = 0; i < crops.length; i++) {
        console.log(`  crop ${i + 1}/${crops.length}…`);
        const raw = await callOne(
            crops[i].toString("base64"),
            "This is quadrant " + (i + 1) + " of 4 of the same menu board. " +
            "Transcribe only lines fully visible in this crop; skip lines cut off at the crop edge."
        );
        tables.push(cleanTable(raw));
    }
    return mergeCropTables(tables) || "";
}

function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function tgSend(text) {
    if (!TG_TOKEN || !TG_CHAT) {
        console.log("  (telegram skipped: env missing)");
        return;
    }
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: TG_CHAT, text: text.slice(0, 4000), parse_mode: "HTML" }),
    });
    if (!res.ok) console.error("  telegram error:", (await res.text()).slice(0, 200));
}

async function main() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: false,
        connectionTimeoutMillis: 8000,
    });
    try {
        await pool.query(`
            ALTER TABLE menu_reports ADD COLUMN IF NOT EXISTS suggested_menu_md TEXT;
            ALTER TABLE menu_reports ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
            ALTER TABLE menu_reports ADD COLUMN IF NOT EXISTS processing_error TEXT;
        `);
        let statusFilter, where, params;
        if (ONLY_ID && FORCE) {
            statusFilter = "TRUE"; where = "AND id = $1"; params = [ONLY_ID];
        } else {
            statusFilter = "status = $1"; where = ONLY_ID ? "AND id = $2" : ""; params = ONLY_ID ? ["new", ONLY_ID] : ["new"];
        }
        const { rows } = await pool.query(
            `SELECT id, place_slug, place_title, message, email, image_mime, image_bytes, image_name
             FROM menu_reports WHERE ${statusFilter} ${where} ORDER BY id LIMIT ${LIMIT}`,
            params
        );
        console.log(`${rows.length} pending report(s)`);
        for (const r of rows) {
            console.log(`\n#${r.id} ${r.place_title || "?"} (${r.place_slug || "?"})`);
            const hasImage = r.image_bytes && r.image_bytes.length > 0;

            // current menu for context
            let current = null;
            if (r.place_slug) {
                const cur = await pool.query("SELECT menu_md FROM places WHERE slug = $1", [r.place_slug]);
                if (cur.rowCount) current = cur.rows[0].menu_md;
            }
            if (!current && r.place_title) {
                const cur = await pool.query("SELECT menu_md FROM places WHERE name ILIKE $1 LIMIT 1", [`%${r.place_title}%`]);
                if (cur.rowCount) current = cur.rows[0].menu_md;
            }

            if (!hasImage) {
                await pool.query(
                    "UPDATE menu_reports SET status='text-only', processed_at=NOW(), updated_at=NOW() WHERE id=$1",
                    [r.id]
                );
                await tgSend(
                    `📝 <b>Menu report #${r.id} — text only, no photo</b>\n` +
                    `<b>Place:</b> ${escapeHtml(r.place_title || "—")}\n` +
                    `<b>Message:</b> ${escapeHtml(r.message || "—")}\n` +
                    `<i>Needs human decision (clear menu? close place?). Nothing auto-changed.</i>`
                );
                console.log("  text-only -> flagged for human");
                continue;
            }

            try {
                let imgBuf = Buffer.from(r.image_bytes);
                if (isHeic(imgBuf, r.image_mime, r.image_name)) {
                    console.log("  HEIC detected -> converting to JPEG");
                    imgBuf = await toJpeg(imgBuf);
                }
                imgBuf = await normalizeOrientation(imgBuf);
                const ctx = [
                    r.message ? `Reporter note: ${r.message.trim()}` : null,
                    current ? `Current menu on file (may be outdated, reconcile with photo + note):\n${current}` : null,
                    "Return the FULL updated menu table.",
                ].filter(Boolean).join("\n\n");
                const engine = VLM_PROVIDER === "cloud" ? VLM_CLOUD_MODEL : VLM_PROVIDER === "zen" ? `zen/${ZEN_MODEL}` : VLM_PROVIDER === "opencode" ? `opencode/${OPENCODE_MODEL}` : VLM_MODEL;
                console.log(`  asking ${engine}…`);
                const raw = await askVlm(imgBuf, ctx);
                const table = cleanTable(raw);
                if (!table) {
                    throw new Error("no valid table in VLM reply: " + raw.slice(0, 200));
                }
                if (DRY_RUN) {
                    console.log(`  DRY-RUN table (${countRows(table)} rows):\n${table}`);
                    continue;
                }
                await pool.query(
                    `UPDATE menu_reports SET suggested_menu_md=$1, status='suggested',
                     processed_at=NOW(), updated_at=NOW(), processing_error=NULL WHERE id=$2`,
                    [table, r.id]
                );
                const oldN = countRows(current), newN = countRows(table);
                await tgSend(
                    `🆕 <b>Suggested menu #${r.id}: ${escapeHtml(r.place_title || "?")}</b>\n` +
                    `rows: ${oldN} → ${newN}` +
                    (r.message ? `\nnote: ${escapeHtml(r.message.trim()).slice(0, 300)}` : "") +
                    `\n\n<pre>${escapeHtml(table).slice(0, 3000)}</pre>\n` +
                    `<i>Approve: node scripts/approve_report.js ${r.id}</i>`
                );
                console.log(`  suggested (${oldN} -> ${newN} rows), preview sent`);
            } catch (e) {
                console.error(`  FAILED: ${e.message}`);
                await pool.query(
                    "UPDATE menu_reports SET status='error', processed_at=NOW(), updated_at=NOW(), processing_error=$1 WHERE id=$2",
                    [String(e.message).slice(0, 1000), r.id]
                );
            }
        }
    } finally {
        await pool.end();
    }
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
