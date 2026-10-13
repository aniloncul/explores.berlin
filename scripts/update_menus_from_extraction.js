#!/usr/bin/env node
/**
 * Write freshly extracted menu tables (menus.json, produced by the
 * gemma4:e4b extraction pipeline in rag-eg2/) into places.menu_md.
 *
 * Usage:
 *   node scripts/update_menus_from_extraction.js [--dry-run] [--menus path]
 *
 * Matching key is the vault note id == places.slug.
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const mi = args.indexOf("--menus");
const MENUS_PATH =
    mi >= 0 && args[mi + 1]
        ? path.resolve(args[mi + 1])
        : "/Volumes/2TBSSD/anilexternal/Documents/rag-eg2/menus.json";

function countRows(table) {
    return table
        .split("\n")
        .filter((ln) => {
            const t = ln.trim();
            if (!t.startsWith("|")) return false;
            const cells = t.split("|").map((c) => c.trim()).filter(Boolean);
            if (cells.length < 2) return false;
            if (/^item$/i.test(cells[0])) return false;
            if (/^[-:\s]+$/.test(cells[0])) return false;
            return true;
        }).length;
}

(async () => {
    const index = JSON.parse(fs.readFileSync(MENUS_PATH, "utf8"));
    const entries = Object.values(index).filter((e) => e.status === "ok" && e.table);
    console.log(`menus.json: ${entries.length} extracted tables`);

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: false,
        connectionTimeoutMillis: 8000,
    });
    await client.connect();

    let updated = 0;
    let missing = 0;
    await client.query("BEGIN");
    try {
        for (const e of entries) {
            // menus.json key is the note id == slug; entry.note holds the vault path
            const slug = e.id;
            const cur = await client.query("SELECT menu_md FROM places WHERE slug = $1", [slug]);
            if (!cur.rowCount) {
                missing++;
                console.log(`  MISSING slug=${slug}`);
                continue;
            }
            const oldRows = cur.rows[0].menu_md ? countRows(cur.rows[0].menu_md) : 0;
            const newRows = countRows(e.table);
            if (!DRY) {
                await client.query("UPDATE places SET menu_md = $1 WHERE slug = $2", [e.table, slug]);
            }
            updated++;
            if (oldRows !== newRows || DRY) {
                console.log(`  ${DRY ? "WOULD-UPDATE" : "updated"} ${slug}: ${oldRows} -> ${newRows} rows`);
            }
        }
        if (DRY) {
            await client.query("ROLLBACK");
            console.log(`\nDRY RUN: ${updated} rows would update, ${missing} missing`);
        } else {
            await client.query("COMMIT");
            console.log(`\nCOMMITTED: ${updated} rows updated, ${missing} missing`);
        }
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        await client.end();
    }
})().catch((e) => {
    console.error("HATA:", e.message);
    process.exit(1);
});
