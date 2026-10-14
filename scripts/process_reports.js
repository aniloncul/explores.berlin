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

const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const VLM_MODEL = process.env.VLM_MODEL || "gemma4:e4b";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

// Same extraction prompt as rag-eg2/extract.py, plus report context appended per-report.
const BASE_PROMPT = `Transcribe this restaurant menu image into a markdown table.

| Item | Price |
|------|-------|

Rules:
- One row per dish or drink that shows a price, in the original menu order.
- Price format: German, e.g. 8,50 € (comma decimal, space before €).
- Keep item names in the language printed on the menu.
- Drop allergen superscripts, portion codes, "Produktinfo", logos, QR codes,
  addresses and opening hours.
- If a price is unreadable write ? instead of guessing.
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
    return rows.join("\n");
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
        console.log(`  sharp convert failed (${e.message}), trying sips…`);
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

async function askVlm(jpegBuf, extraContext) {
    const b64 = jpegBuf.toString("base64");
    const content = extraContext ? `${BASE_PROMPT}\n\n${extraContext}` : BASE_PROMPT;
    const res = await fetch(`${OLLAMA}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: VLM_MODEL,
            stream: false,
            think: false,
            messages: [{ role: "user", content, images: [b64] }],
            options: { temperature: 0, num_ctx: 8192, num_predict: 4096 },
        }),
        signal: AbortSignal.timeout(1200_000),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.message?.content || "";
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
        const where = ONLY_ID ? "AND id = $2" : "";
        const params = ONLY_ID ? ["new", ONLY_ID] : ["new"];
        const { rows } = await pool.query(
            `SELECT id, place_slug, place_title, message, email, image_mime, image_bytes, image_name
             FROM menu_reports WHERE status = $1 ${where} ORDER BY id LIMIT ${LIMIT}`,
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
                const ctx = [
                    r.message ? `Reporter note: ${r.message.trim()}` : null,
                    current ? `Current menu on file (may be outdated, reconcile with photo + note):\n${current}` : null,
                    "Return the FULL updated menu table.",
                ].filter(Boolean).join("\n\n");
                console.log(`  asking ${VLM_MODEL}…`);
                const raw = await askVlm(imgBuf, ctx);
                const table = cleanTable(raw);
                if (!table) {
                    throw new Error("no valid table in VLM reply: " + raw.slice(0, 200));
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
