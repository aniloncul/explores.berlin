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
- If a cocktail or dish lists ingredients, append them in parentheses after
  the name, e.g. "Gin Basil (Tanqueray Dry Gin, Zuckersirup, Zitronensaft)".
  Keep them short: drop allergen codes and additive numbers.
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
- DO group dishes under their printed section: start each menu section with
  a "### SECTION NAME" heading line (e.g. "### BIER", "### COCKTAILS"),
  then that section's table. One table per section, never mix sections.
- For drinks with several sizes (beer, wine by the glass) the section table
  MUST use volumes as columns, e.g. "| Item | 0,3L | 0,5L |" followed by
  "| Pilsner | 4,80 € | 5,50 € |". Only volumes go in the header, never
  other text. Single-size sections use "| Item | Price |".
- A ? price is only allowed for a real dish or drink whose name you can read
  clearly. If a line has no readable item name, skip it, do not emit it.
- Never use bold (**) or any other markdown formatting inside the table.
- If several photos were given, start each photo's part with a "### Page N"
  heading line, then its table. Do not merge pages.
- Output the table directly with no analysis.
- Output only headings + markdown table(s). No commentary, no code fences.`;

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

function isVolumeCell(s) {
    return /^(\d+[,.]?\d*)\s*(l|cl|ml)$/i.test(String(s).trim());
}

// Block-based parse: "### " headings preserved; each "|" table validated but
// kept in its ORIGINAL shape (standard or size-column) for the review md.
// Returns md or null.
function cleanTable(raw) {
    const text = String(raw || "").replace(/```/g, "");
    const out = [];
    let block = null; // { headLine, rows: string[], vols: string[]|null }
    let realRows = 0;
    const rowValid = (cells, vols) => {
        if (vols) {
            return cells
                .slice(1, vols.length + 1)
                .some((c) => normPrice(String(c || "").replace(/\s+/g, " ")) !== null);
        }
        return normPrice(String(cells[1] || "").replace(/\s+/g, " ")) !== null;
    };
    const flush = () => {
        if (!block) return;
        if (block.rows.length) {
            out.push(block.headLine, "|------|-------|", ...block.rows);
            realRows += block.rows.length;
        }
        block = null;
    };
    for (const rawLn of text.split("\n")) {
        const t = rawLn.trimEnd().trim();
        if (t.startsWith("### ")) {
            flush();
            out.push(t.replace(/\s+/g, " ").trim());
            continue;
        }
        if (!t.startsWith("|") || t.includes("**")) {
            if (block && !t.startsWith("|")) flush();
            continue;
        }
        const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (cells.length < 2) continue;
        if (/^[-:\s]+$/.test(cells[0])) continue; // separator row
        if (cells[0].toLowerCase() === "item") {
            if (block) flush();
            const vols = cells.length > 2 && cells.slice(1).every(isVolumeCell) ? cells.slice(1) : null;
            block = { headLine: t, rows: [], vols };
            continue;
        }
        if (!block) continue; // row without header: skip
        const item = String(cells[0] || "").replace(/\s+/g, " ").trim();
        if (!item || !rowValid(cells, block.vols)) continue;
        block.rows.push(t);
    }
    flush();
    if (!realRows) return null;
    return out.join("\n");
}

// Flat single table for places.menu_md: size-column tables expand to one row
// per size ("Name (0,3L)"), headings dropped, deduped.
function flattenTable(md) {
    if (!md) return null;
    const rows = ["| Item | Price |", "|------|-------|"];
    const seen = new Set();
    const push = (line) => {
        const key = line.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        rows.push(line);
    };
    let vols = null;
    for (const ln of md.split("\n")) {
        const t = ln.trim();
        if (t.startsWith("### ")) { vols = null; continue; }
        if (!t.startsWith("|")) { vols = null; continue; }
        const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (cells.length < 2) continue;
        if (/^[-:\s]+$/.test(cells[0])) continue;
        if (cells[0].toLowerCase() === "item") {
            vols = cells.length > 2 && cells.slice(1).every(isVolumeCell) ? cells.slice(1) : null;
            continue;
        }
        const item = String(cells[0]).replace(/\s+/g, " ").trim();
        if (!item) continue;
        if (vols) {
            for (let i = 0; i < vols.length; i++) {
                const p = normPrice(String(cells[i + 1] || "").replace(/\s+/g, " "));
                if (p === null || p === "?") continue;
                push(`| ${item} (${vols[i]}) | ${p} |`);
            }
        } else {
            const p = normPrice(String(cells[1] || "").replace(/\s+/g, " "));
            if (p === null) continue;
            push(`| ${item} | ${p} |`);
        }
    }
    return rows.length > 2 ? rows.join("\n") : null;
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
    const PY = process.env.PIL_PYTHON || "python3";
    const tmpIn = path.join(os.tmpdir(), `nrm_${Date.now()}.jpg`);
    fs.writeFileSync(tmpIn, jpegBuf);
    try {
        const out = execFileSync(PY, ["-c",
            "import sys;from PIL import Image,ImageOps;" +
            "im=Image.open(sys.argv[1]);im=ImageOps.exif_transpose(im);" +
            "im=im.convert('RGB');im.save(sys.argv[2],'JPEG',quality=90)",
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

function multiPreamble(n, start, total) {
    if (total <= 1) return "";
    const end = start + n - 1;
    return `\n\nThe attached ${n} photo(s) are pages ${start}..${end} of a ${total}-photo menu, in order. ` +
        `Start each photo's part with its exact page heading ("### Page ${start}", etc). ` +
        `Merge nothing across photos.`;
}

async function askVlm(jpegBufs, extraContext, pageStart, pageTotal) {
    const ps = pageStart || 1, pt = pageTotal || jpegBufs.length;
    const content = extraContext
        ? `${BASE_PROMPT}${multiPreamble(jpegBufs.length, ps, pt)}\n\n${extraContext}`
        : `${BASE_PROMPT}${multiPreamble(jpegBufs.length, ps, pt)}`;
    if (VLM_PROVIDER === "cloud") return askVlmCloud(jpegBufs, content);
    if (VLM_PROVIDER === "zen") return askVlmZen(jpegBufs, content);
    if (VLM_PROVIDER === "opencode") return askVlmOpencode(jpegBufs, content);
    // local path: downscale for speed/context
    const sharp = (await import("sharp")).default;
    const images = [];
    for (const b of jpegBufs) {
        const small = await sharp(b).resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
        images.push(small.toString("base64"));
    }
    const res = await fetch(`${OLLAMA}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: VLM_MODEL,
            stream: false,
            think: VLM_THINK,
            messages: [{ role: "user", content, images }],
            options: { temperature: 0, num_ctx: VLM_CTX, num_predict: VLM_PREDICT },
        }),
        signal: AbortSignal.timeout(1200_000),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.message?.content || "";
}

async function askVlmOpencode(jpegBufs, content) {
    // Headless opencode run: images must live inside the workspace (/tmp is blocked).
    const { execFileSync } = require("child_process");
    const dir = path.join(__dirname, "..", "tmp_reports");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = Date.now();
    const paths = [];
    try {
        const fileArgs = [];
        jpegBufs.forEach((b, i) => {
            const imgPath = path.join(dir, `rep_${stamp}_${i}.jpg`);
            fs.writeFileSync(imgPath, b);
            paths.push(imgPath);
            fileArgs.push("-f", path.relative(path.join(__dirname, ".."), imgPath));
        });
        const out = execFileSync(
            OPENCODE_BIN,
            ["run", `${content}\n\nMenu photo(s): read them in the given order — already upright, do not rotate. ` +
             `Do NOT use any tools, do NOT run any commands, do NOT inspect files. ` +
             `Just read the images and reply with the transcription. ` +
             `Work only inside the project directory.`,
             "-m", OPENCODE_MODEL, ...fileArgs],
            { encoding: "utf8", timeout: 600_000, maxBuffer: 8 * 1024 * 1024 }
        );
        return out;
    } finally {
        for (const p of paths) { try { fs.unlinkSync(p); } catch {} }
    }
}

async function askVlmZen(jpegBufs, content) {
    const key = process.env.OPENCODE_API_KEY;
    if (!key) throw new Error("OPENCODE_API_KEY missing for zen VLM");
    const blocks = [{ type: "text", text: content }];
    for (const b of jpegBufs) {
        blocks.push({ type: "image_url", image_url: { url: "data:image/jpeg;base64," + b.toString("base64") } });
    }
    const res = await fetch(`${ZEN_API}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: ZEN_MODEL,
            messages: [{
                role: "user",
                content: blocks,
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

async function askVlmCloud(jpegBufs, content) {
    const key = process.env.NVIDIA_API_KEY;
    if (!key) throw new Error("NVIDIA_API_KEY missing for cloud VLM");
    const callOne = async (b64s, extra) => {
        const blocks = [{ type: "text", text: extra ? `${content}\n\n${extra}` : content }];
        for (const b64 of b64s) {
            blocks.push({ type: "image_url", image_url: { url: "data:image/jpeg;base64," + b64 } });
        }
        const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: VLM_CLOUD_MODEL,
                messages: [{
                    role: "user",
                    content: blocks,
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
    // Multi-page reports skip crops (one call, all pages).
    if (jpegBufs.length > 1) {
        return callOne(jpegBufs.map((b) => b.toString("base64")));
    }
    const jpegBuf = jpegBufs[0];
    let crops = null;
    try {
        crops = await makeCrops(jpegBuf);
    } catch (e) {
        console.log(`  crop failed (${e.message.split("\n")[0]}), single-shot`);
    }
    if (!crops) return callOne([jpegBuf.toString("base64")]);
    const tables = [];
    for (let i = 0; i < crops.length; i++) {
        console.log(`  crop ${i + 1}/${crops.length}…`);
        const raw = await callOne(
            [crops[i].toString("base64")],
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

const VAULT = process.env.OBSIDIAN_VAULT_PATH || "/Volumes/2TBSSD/data/berlin-menus";

// Md-first archive: per-page tables + photo files under vault/reports/.
// Returns the note path (vault-relative) for the Telegram preview.
function writeReportMd(r, pagesMd, jpegBufs) {
    const dir = path.join(VAULT, "reports");
    fs.mkdirSync(dir, { recursive: true });
    const photos = jpegBufs.map((b, i) => {
        const fname = `report-${r.id}-p${i + 1}.jpg`;
        fs.writeFileSync(path.join(dir, fname), b);
        return fname;
    });
    // Normalize page headings to ## sections (model emits ### Page N)
    const body = pagesMd
        .split("\n")
        .map((l) => (l.startsWith("### ") ? "## " + l.slice(4) : l))
        .join("\n");
    const md = [
        "---",
        `report: ${r.id}`,
        `place_title: "${String(r.place_title || "").replace(/"/g, "")}"`,
        `place_slug: "${String(r.place_slug || "").replace(/"/g, "")}"`,
        `date: ${new Date().toISOString().slice(0, 10)}`,
        `photos: ${photos.length}`,
        "status: suggested",
        "---",
        "",
        `# Menu report ${r.id} — ${r.place_title || "?"}`,
        "",
        r.message ? `Reporter note: ${r.message.trim()}` : null,
        "",
        ...photos.map((f) => `![[${f}]]`),
        "",
        body,
        "",
    ].filter((x) => x !== null).join("\n");
    const notePath = path.join(dir, `report-${r.id}.md`);
    fs.writeFileSync(notePath, md);
    console.log(`  vault: reports/report-${r.id}.md (${photos.length} photos)`);
    return `reports/report-${r.id}.md`;
}

async function tgSend(text, replyMarkup) {
    if (!TG_TOKEN || !TG_CHAT) {
        console.log("  (telegram skipped: env missing)");
        return;
    }
    const payload = { chat_id: TG_CHAT, text: text.slice(0, 4000), parse_mode: "HTML" };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) console.error("  telegram error:", (await res.text()).slice(0, 200));
}

function approvalKeyboard(reportId) {
    return {
        inline_keyboard: [[
            { text: "✅ Approve", callback_data: `approve:${reportId}` },
            { text: "❌ Reject", callback_data: `reject:${reportId}` },
        ]],
    };
}

// --- Telegram inbox: owner taps Approve/Reject (or types /approve N) ---
async function tgApi(method, body) {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
    });
    return res.json().catch(() => ({}));
}

async function runApproveChild(reportId, mode) {
    const { spawnSync } = require("child_process");
    const args = [path.join(__dirname, "approve_report.js"), String(reportId)];
    if (mode === "reject") args.push("--reject");
    const r = spawnSync(process.execPath, args, {
        cwd: path.join(__dirname, ".."),
        encoding: "utf8",
        timeout: 120000,
    });
    const out = ((r.stdout || "") + (r.stderr || "")).slice(-500);
    if (r.status !== 0) throw new Error(`approve child failed: ${out || r.error}`);
    return out;
}

async function handleTgUpdate(u, pool) {
    const owner = String(TG_CHAT);
    if (u.callback_query) {
        const cb = u.callback_query;
        if (String(cb.from?.id) !== owner) return; // owner's taps only
        const m = String(cb.data || "").match(/^(approve|reject):(\d+)$/);
        if (!m) return;
        const [, mode, id] = m;
        try {
            // Guard: already decided → just acknowledge, don't re-run
            if (pool) {
                const cur = await pool.query("SELECT status FROM menu_reports WHERE id=$1", [id]);
                const st = cur.rows[0]?.status;
                if (st === "applied" || st === "rejected") {
                    await tgApi("answerCallbackQuery", {
                        callback_query_id: cb.id,
                        text: `Report #${id} already ${st} ✅`,
                    });
                    return;
                }
            }
            await runApproveChild(id, mode);
            await tgApi("answerCallbackQuery", {
                callback_query_id: cb.id,
                text: mode === "approve" ? `Report #${id} applied ✅` : `Report #${id} rejected`,
            });
            // Remove buttons so it can't be tapped twice
            if (cb.message) {
                await tgApi("editMessageReplyMarkup", {
                    chat_id: cb.message.chat.id,
                    message_id: cb.message.message_id,
                    reply_markup: { inline_keyboard: [] },
                }).catch(() => {});
            }
        } catch (e) {
            await tgApi("answerCallbackQuery", {
                callback_query_id: cb.id,
                text: `Failed: ${String(e.message).slice(0, 150)}`,
                show_alert: true,
            });
        }
        return;
    }
    const msg = u.message;
    if (msg && String(msg.from?.id) === owner && msg.text) {
        const m = msg.text.trim().match(/^\/(approve|reject)[@\w]*\s+(\d+)/);
        if (!m) return;
        try {
            await runApproveChild(m[2], m[1]);
        } catch (e) {
            await tgSend(`⚠️ <b>/${m[1]} ${m[2]} failed:</b> ${escapeHtml(String(e.message).slice(0, 300))}`);
        }
    }
}

async function checkTelegramInbox(pool) {
    if (!TG_TOKEN || !TG_CHAT) return;
    const offFile = path.join(__dirname, "..", "tmp_reports", ".tg_offset");
    let offset = 0;
    try { offset = parseInt(fs.readFileSync(offFile, "utf8"), 10) || 0; } catch {}
    let data;
    try {
        const res = await fetch(
            `https://api.telegram.org/bot${TG_TOKEN}/getUpdates?offset=${offset}&timeout=0`,
            { signal: AbortSignal.timeout(30000) }
        );
        data = await res.json();
    } catch (e) {
        console.error("  inbox check failed:", e.message);
        return;
    }
    const updates = data.ok ? data.result || [] : [];
    if (!updates.length) return;
    console.log(`  inbox: ${updates.length} update(s)`);
    for (const u of updates) {
        offset = Math.max(offset, (u.update_id || 0) + 1);
        try { await handleTgUpdate(u, pool); } catch (e) { console.error("  inbox item failed:", e.message); }
    }
    try {
        fs.mkdirSync(path.dirname(offFile), { recursive: true });
        fs.writeFileSync(offFile, String(offset));
    } catch {}
}

async function main() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: false,
        connectionTimeoutMillis: 8000,
        idleTimeoutMillis: 5000, // server kills idle sessions; recycle fast
    });
    // Idle connections die during long VLM runs — swallow, pool reconnects.
    pool.on("error", (e) => console.error("  (pool) " + String(e.message).split("\n")[0]));
    // Query with one retry on server-killed connections.
    const q = async (text, params) => {
        try {
            return await pool.query(text, params);
        } catch (e) {
            if (/terminat|connection.*(reset|closed|timeout)|idle-session/i.test(String(e && e.message))) {
                console.log("  (retrying killed query…)");
                await new Promise((r) => setTimeout(r, 1500));
                return pool.query(text, params);
            }
            throw e;
        }
    };
    await checkTelegramInbox(pool);
    if (process.argv.includes("--inbox-only")) {
        await pool.end();
        return; // lightweight 1-min cron: buttons only, no VLM
    }
    try {
        await q(`
            ALTER TABLE menu_reports ADD COLUMN IF NOT EXISTS suggested_menu_md TEXT;
            ALTER TABLE menu_reports ADD COLUMN IF NOT EXISTS suggested_sections_md TEXT;
            ALTER TABLE menu_reports ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
            ALTER TABLE menu_reports ADD COLUMN IF NOT EXISTS processing_error TEXT;
        `);
        let statusFilter, where, params;
        if (ONLY_ID && FORCE) {
            statusFilter = "TRUE"; where = "AND id = $1"; params = [ONLY_ID];
        } else {
            // 'new' + stale 'processing' left by a crashed Vercel cron run
            statusFilter = "(status = $1 OR (status = 'processing' AND updated_at < NOW() - INTERVAL '1 hour'))"; where = ONLY_ID ? "AND id = $2" : ""; params = ONLY_ID ? ["new", ONLY_ID] : ["new"];
        }
        const { rows } = await q(
            `SELECT id, place_slug, place_title, message, email, image_mime, image_bytes, image_name
             FROM menu_reports WHERE ${statusFilter} ${where} ORDER BY id LIMIT ${LIMIT}`,
            params
        );
        console.log(`${rows.length} pending report(s)`);
        for (const r of rows) {
            console.log(`\n#${r.id} ${r.place_title || "?"} (${r.place_slug || "?"})`);
            // All photos: new side table first, legacy single column as fallback
            let raws = [];
            try {
                const imgs = await q(
                    "SELECT image_mime, image_bytes, image_name FROM menu_report_images WHERE report_id=$1 ORDER BY position",
                    [r.id]
                );
                raws = imgs.rows.filter((x) => x.image_bytes && x.image_bytes.length > 0);
            } catch { /* table may not exist on old DBs */ }
            if (!raws.length && r.image_bytes && r.image_bytes.length > 0) {
                raws = [{ image_mime: r.image_mime, image_bytes: r.image_bytes, image_name: r.image_name }];
            }
            const hasImage = raws.length > 0;

            // current menu for context
            let current = null;
            if (r.place_slug) {
                const cur = await q("SELECT menu_md FROM places WHERE slug = $1", [r.place_slug]);
                if (cur.rowCount) current = cur.rows[0].menu_md;
            }
            if (!current && r.place_title) {
                const cur = await q("SELECT menu_md FROM places WHERE name ILIKE $1 LIMIT 1", [`%${r.place_title}%`]);
                if (cur.rowCount) current = cur.rows[0].menu_md;
            }

            if (!hasImage) {
                await q(
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
                const jpegBufs = [];
                for (const [i, im] of raws.entries()) {
                    let imgBuf = Buffer.from(im.image_bytes);
                    if (isHeic(imgBuf, im.image_mime, im.image_name)) {
                        console.log(`  photo ${i + 1}/${raws.length}: HEIC -> JPEG`);
                        imgBuf = await toJpeg(imgBuf);
                    }
                    jpegBufs.push(await normalizeOrientation(imgBuf));
                }
                console.log(`  ${jpegBufs.length} photo(s) ready`);
                const ctx = [
                    r.message ? `Reporter note: ${r.message.trim()}` : null,
                    current ? `Current menu on file (may be outdated, reconcile with photo + note):\n${current}` : null,
                    "Return the FULL updated menu table.",
                ].filter(Boolean).join("\n\n");
                const engine = VLM_PROVIDER === "cloud" ? VLM_CLOUD_MODEL : VLM_PROVIDER === "zen" ? `zen/${ZEN_MODEL}` : VLM_PROVIDER === "opencode" ? `opencode/${OPENCODE_MODEL}` : VLM_MODEL;
                console.log(`  asking ${engine}…`);
                // Batch large photo sets (context safety), renumber pages globally
                const BATCH = parseInt(process.env.VLM_BATCH || "4", 10);
                let pageNo = 1;
                const batchOuts = [];
                for (let b = 0; b < jpegBufs.length; b += BATCH) {
                    const chunk = jpegBufs.slice(b, b + BATCH);
                    console.log(`  batch ${Math.floor(b / BATCH) + 1}/${Math.ceil(jpegBufs.length / BATCH)} (${chunk.length} photos)…`);
                    const out = await askVlm(chunk, ctx, pageNo, jpegBufs.length);
                    batchOuts.push(out.replace(/^### Page \d+/gm, () => `### Page ${pageNo++}`));
                }
                const pagesMd = cleanTable(batchOuts.join("\n"));
                if (!pagesMd) {
                    throw new Error("no valid table in VLM reply: " + batchOuts.join("\n").slice(0, 200));
                }
                const table = flattenTable(pagesMd);
                if (!table) {
                    throw new Error("flatten produced no rows");
                }
                if (DRY_RUN) {
                    console.log(`  DRY-RUN pages (${countRows(table)} rows):\n${pagesMd}`);
                    continue;
                }
                // Vault first: per-page md + photo archive (best effort)
                let vaultPath = null;
                try {
                    vaultPath = writeReportMd(r, pagesMd, jpegBufs);
                } catch (e) {
                    console.error("  vault write failed:", e.message);
                }
                await q(
                    `UPDATE menu_reports SET suggested_menu_md=$1, suggested_sections_md=$2, status='suggested',
                     processed_at=NOW(), updated_at=NOW(), processing_error=NULL WHERE id=$3`,
                    [table, pagesMd, r.id]
                );
                const oldN = countRows(current), newN = countRows(table);
                const pages = (pagesMd.match(/^### /gm) || []).length || 1;
                await tgSend(
                    `🆕 <b>Suggested menu #${r.id}: ${escapeHtml(r.place_title || "?")}</b>\n` +
                    `photos: ${raws.length}, pages: ${pages}, rows: ${oldN} → ${newN}` +
                    (r.message ? `\nnote: ${escapeHtml(r.message.trim()).slice(0, 300)}` : "") +
                    (vaultPath ? `\nvault: <code>${escapeHtml(vaultPath)}</code>` : "") +
                    `\n\n<pre>${escapeHtml(pagesMd).slice(0, 3000)}</pre>`,
                    approvalKeyboard(r.id)
                );
                console.log(`  suggested (${oldN} -> ${newN} rows, ${pages} pages), preview sent`);
            } catch (e) {
                console.error(`  FAILED: ${e.message}`);
                if (DRY_RUN) continue; // never write in dry-run
                await q(
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
