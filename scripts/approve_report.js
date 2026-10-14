#!/usr/bin/env node
/**
 * Approve (or reject) a suggested menu.
 *
 *   node scripts/approve_report.js <id>           # apply suggested_menu_md -> places.menu_md
 *   node scripts/approve_report.js <id> --reject  # discard suggestion
 *   node scripts/approve_report.js <id> --slug <slug>  # force place link
 *
 * On approve: UPDATE places SET menu_md (matched by slug, fallback by name),
 * status='applied'. Also syncs the vault place note's ## Menu block when the
 * note is found (vault stays source-of-truth per repo convention).
 * Cloud RAG reads Postgres directly, so Ask AI serves the new menu immediately.
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const VAULT = process.env.OBSIDIAN_VAULT_PATH || "/Volumes/2TBSSD/data/berlin-menus";

function syncVaultNoteMenu(slug, flatTable) {
    // Find places/**/<slug>.md, replace its ## Menu block. Returns note path or null.
    const { execFileSync } = require("child_process");
    let note = null;
    try {
        const out = execFileSync("find", [path.join(VAULT, "places"), "-name", `${slug}.md`], { encoding: "utf8", timeout: 15000 }).trim();
        note = out.split("\n")[0] || null;
    } catch { return null; }
    if (!note) return null;
    const text = fs.readFileSync(note, "utf8");
    const block = `## Menu\n\n${flatTable}\n`;
    let next;
    if (/^## Menu/m.test(text)) {
        next = text.replace(/^## Menu[\s\S]*?(?=^## |\s*$)/m, () => block + "\n");
    } else {
        next = text.trimEnd() + "\n\n" + block;
    }
    fs.writeFileSync(note, next);
    return note;
}

async function main() {
    const id = parseInt(process.argv[2], 10);
    const reject = process.argv.includes("--reject");
    const si = process.argv.indexOf("--slug");
    const forceSlug = si >= 0 && process.argv[si + 1] ? process.argv[si + 1] : null;
    if (!id) {
        console.error("Usage: node scripts/approve_report.js <id> [--reject] [--slug <slug>]");
        process.exit(1);
    }
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: false,
        connectionTimeoutMillis: 8000,
    });
    const tgSend = async (text) => {
        const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
        if (!token || !chat) return;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), parse_mode: "HTML" }),
        });
    };
    try {
        const { rows } = await pool.query("SELECT * FROM menu_reports WHERE id = $1", [id]);
        if (!rows.length) throw new Error(`report #${id} not found`);
        const r = rows[0];
        if (reject) {
            await pool.query("UPDATE menu_reports SET status='rejected', updated_at=NOW() WHERE id=$1", [id]);
            console.log(`#${id} rejected`);
            await tgSend(`❌ <b>Report #${id} rejected</b> — nothing changed.`);
            return;
        }
        if (!r.suggested_menu_md) throw new Error(`report #${id} has no suggested_menu_md (status=${r.status})`);

        let target = null;
        if (forceSlug) {
            const cur = await pool.query("SELECT slug, name FROM places WHERE slug = $1", [forceSlug]);
            if (cur.rowCount) target = cur.rows[0];
            if (!target) throw new Error(`--slug ${forceSlug} not found in places`);
        }
        if (!target && r.place_slug) {
            const cur = await pool.query("SELECT slug, name FROM places WHERE slug = $1", [r.place_slug]);
            if (cur.rowCount) target = cur.rows[0];
        }
        if (!target && r.place_title) {
            const cur = await pool.query("SELECT slug, name FROM places WHERE name ILIKE $1 LIMIT 1", [`%${r.place_title}%`]);
            if (cur.rowCount) target = cur.rows[0];
        }
        if (!target) {
            throw new Error(`no places row matches slug=${r.place_slug} title=${r.place_title} — link it manually`);
        }
        await pool.query("BEGIN");
        try {
            await pool.query("UPDATE places SET menu_md = $1 WHERE slug = $2", [r.suggested_menu_md, target.slug]);
            await pool.query("UPDATE menu_reports SET status='applied', updated_at=NOW() WHERE id=$1", [id]);
            await pool.query("COMMIT");
        } catch (e) {
            await pool.query("ROLLBACK");
            throw e;
        }
        console.log(`#${id} applied -> places(${target.slug})`);
        let vaultNote = null;
        try {
            vaultNote = syncVaultNoteMenu(target.slug, r.suggested_menu_md);
            if (vaultNote) console.log(`vault note synced: ${vaultNote}`);
            else console.log("vault note not found — DB only");
        } catch (e) {
            console.error("vault sync failed:", e.message);
        }
        await tgSend(`✅ <b>Report #${id} applied</b> → ${target.name} menu updated. Ask AI serves it now.`);
    } finally {
        await pool.end();
    }
}

main().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
