#!/usr/bin/env node
/**
 * Compress place covers (WebP) → Postgres place_covers.
 * Sets places.images to ['/api/places/cover/{slug}'].
 *
 * Usage:
 *   node scripts/store_place_covers.js
 *   node scripts/store_place_covers.js --max 50 --force
 *   node scripts/store_place_covers.js --width 640 --quality 72
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const sharp = require("sharp");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const VAULT = process.env.OBSIDIAN_VAULT_PATH;
const DATABASE_URL = process.env.DATABASE_URL;
const PUBLIC_IMG = path.resolve(__dirname, "../public/images/places");

if (!DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
}

function parseArgs(argv) {
    const args = {
        max: 0,
        force: false,
        width: 640,
        quality: 72,
        delay: 0,
        help: false,
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--max") args.max = Number(argv[++i]) || 0;
        else if (a === "--force") args.force = true;
        else if (a === "--width") args.width = Number(argv[++i]) || 640;
        else if (a === "--quality") args.quality = Number(argv[++i]) || 72;
        else if (a === "--delay") args.delay = Number(argv[++i]) || 0;
        else if (a === "--help" || a === "-h") args.help = true;
    }
    return args;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS place_covers (
    slug TEXT PRIMARY KEY REFERENCES places(slug) ON DELETE CASCADE,
    mime TEXT NOT NULL DEFAULT 'image/webp',
    width INT,
    height INT,
    bytes BYTEA NOT NULL,
    byte_size INT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_place_covers_updated ON place_covers(updated_at);
`;

function findCoverFile(slug) {
    const dir = path.join(PUBLIC_IMG, slug);
    if (!fs.existsSync(dir)) return null;
    for (const name of ["1.jpg", "1.jpeg", "1.png", "1.webp", "1.JPG", "1.PNG"]) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) return p;
    }
    const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    if (!files.length) return null;
    return path.join(dir, files.sort()[0]);
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        console.log(
            "Usage: node scripts/store_place_covers.js [--max n] [--force] [--width 640] [--quality 72]"
        );
        process.exit(0);
    }

    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
        console.log("Ensuring place_covers schema…");
        await client.query(SCHEMA);

        const existingRes = await client.query(
            args.force
                ? "SELECT slug FROM place_covers"
                : "SELECT slug FROM place_covers"
        );
        const have = new Set(existingRes.rows.map((r) => r.slug));

        // Candidates: slug has file on disk
        if (!fs.existsSync(PUBLIC_IMG)) {
            throw new Error(`Missing ${PUBLIC_IMG}`);
        }
        const slugs = fs
            .readdirSync(PUBLIC_IMG)
            .filter((d) => {
                try {
                    return fs.statSync(path.join(PUBLIC_IMG, d)).isDirectory();
                } catch {
                    return false;
                }
            })
            .filter((s) => findCoverFile(s))
            .sort();

        let queue = slugs;
        if (!args.force) queue = slugs.filter((s) => !have.has(s));
        if (args.max > 0) queue = queue.slice(0, args.max);

        console.log(
            `Files on disk: ${slugs.length} | already stored: ${have.size} | queue: ${queue.length}`
        );
        if (!queue.length) {
            console.log("Nothing to do.");
            await summarize(client);
            return;
        }

        const stats = {
            stored: 0,
            skippedNoRow: 0,
            errors: 0,
            bytes: 0,
            srcBytes: 0,
        };

        for (let i = 0; i < queue.length; i++) {
            const slug = queue[i];
            try {
                const file = findCoverFile(slug);
                if (!file) {
                    stats.skippedNoRow++;
                    continue;
                }
                const src = fs.readFileSync(file);
                const meta = await sharp(src).metadata();
                const out = await sharp(src)
                    .resize({
                        width: args.width,
                        withoutEnlargement: true,
                        fit: "inside",
                    })
                    .webp({ quality: args.quality })
                    .toBuffer({ resolveWithObject: true });

                const width = out.info.width;
                const height = out.info.height;

                await client.query(
                    `
                    INSERT INTO place_covers (slug, mime, width, height, bytes, byte_size, updated_at)
                    VALUES ($1, 'image/webp', $2, $3, $4, $5, NOW())
                    ON CONFLICT (slug) DO UPDATE SET
                        mime = EXCLUDED.mime,
                        width = EXCLUDED.width,
                        height = EXCLUDED.height,
                        bytes = EXCLUDED.bytes,
                        byte_size = EXCLUDED.byte_size,
                        updated_at = NOW()
                    `,
                    [slug, width, height, out.data, out.data.length]
                );

                await client.query(
                    `UPDATE places SET images = ARRAY[$1::text], updated_at = NOW() WHERE slug = $2`,
                    [`/api/places/cover/${slug}`, slug]
                );

                stats.stored++;
                stats.bytes += out.data.length;
                stats.srcBytes += src.length;

                if ((i + 1) % 50 === 0 || i === queue.length - 1) {
                    const avg = Math.round(stats.bytes / stats.stored);
                    console.log(
                        `  ${i + 1}/${queue.length} stored=${stats.stored} errors=${stats.errors} avg=${avg}B total=${(stats.bytes / 1024 / 1024).toFixed(1)}MB`
                    );
                }
                if (args.delay) await new Promise((r) => setTimeout(r, args.delay));
            } catch (e) {
                stats.errors++;
                console.error(`  fail ${slug}: ${e.message}`);
            }
        }

        console.log(`
Done.
  stored:     ${stats.stored}
  errors:     ${stats.errors}
  src total:  ${(stats.srcBytes / 1024 / 1024).toFixed(1)} MB
  webp total: ${(stats.bytes / 1024 / 1024).toFixed(1)} MB
  ratio:      ${stats.srcBytes ? Math.round((stats.bytes / stats.srcBytes) * 100) + "%" : "n/a"}
`);
        await summarize(client);
    } finally {
        await client.end();
    }
}

async function summarize(client) {
    const r = await client.query(`
        SELECT
            count(*)::int AS covers,
            pg_size_pretty(coalesce(sum(byte_size), 0)) AS cover_size,
            pg_size_pretty(pg_total_relation_size('place_covers')) AS table_size
        FROM place_covers
    `);
    const p = await client.query(`
        SELECT count(*)::int n FROM places
        WHERE images IS NOT NULL AND images[1] LIKE '/api/places/cover/%'
    `);
    console.log("place_covers:", r.rows[0], "| places pointing at cover API:", p.rows[0].n);
}

main().catch((err) => {
    console.error("Store covers failed:", err);
    process.exit(1);
});
