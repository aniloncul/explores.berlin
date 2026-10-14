#!/usr/bin/env node
/**
 * Approve (or reject) a suggested menu.
 *
 *   node scripts/approve_report.js <id>           # apply suggested_menu_md -> places.menu_md
 *   node scripts/approve_report.js <id> --reject  # discard suggestion
 *
 * On approve: UPDATE places SET menu_md (matched by slug, fallback by name),
 * status='applied'. Cloud RAG reads Postgres directly, so Ask AI serves the
 * new menu immediately.
 */
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

async function main() {
    const id = parseInt(process.argv[2], 10);
    const reject = process.argv.includes("--reject");
    if (!id) {
        console.error("Usage: node scripts/approve_report.js <id> [--reject]");
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
        if (r.place_slug) {
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
        await tgSend(`✅ <b>Report #${id} applied</b> → ${target.name} menu updated. Ask AI serves it now.`);
    } finally {
        await pool.end();
    }
}

main().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
