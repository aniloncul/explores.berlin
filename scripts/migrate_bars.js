#!/usr/bin/env node
/**
 * Migrate vault place notes → PostgreSQL `places` table.
 *
 * Usage:
 *   node scripts/migrate_bars.js           # migrate type=bar only (default)
 *   node scripts/migrate_bars.js --type bar
 *   node scripts/migrate_bars.js --type all
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const matter = require("gray-matter");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const VAULT = process.env.OBSIDIAN_VAULT_PATH;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
}
if (!VAULT || !fs.existsSync(VAULT)) {
    console.error("OBSIDIAN_VAULT_PATH missing or not found:", VAULT);
    process.exit(1);
}

function parseArgs(argv) {
    const args = { type: "bar" };
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === "--type") args.type = argv[++i];
    }
    return args;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS places (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'bar',
    neighborhood VARCHAR(100),
    address TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    smoking VARCHAR(50),
    price_range VARCHAR(10),
    cuisine TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    website TEXT,
    phone VARCHAR(100),
    hours JSONB,
    opening_hours_raw TEXT,
    google_place_id VARCHAR(255),
    google_name VARCHAR(255),
    google_verified BOOLEAN,
    google_rating DOUBLE PRECISION,
    google_user_ratings_total INTEGER,
    google_types TEXT[] DEFAULT '{}',
    google_primary_type VARCHAR(100),
    google_primary_type_display VARCHAR(100),
    source VARCHAR(50),
    source_id VARCHAR(255),
    menu_md TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE places ADD COLUMN IF NOT EXISTS google_types TEXT[] DEFAULT '{}';
ALTER TABLE places ADD COLUMN IF NOT EXISTS google_primary_type VARCHAR(100);
ALTER TABLE places ADD COLUMN IF NOT EXISTS google_primary_type_display VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_places_google_place_id
    ON places(google_place_id) WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_places_type ON places(type);
CREATE INDEX IF NOT EXISTS idx_places_neighborhood ON places(neighborhood);
CREATE INDEX IF NOT EXISTS idx_places_slug ON places(slug);
`;

function collectNotes(type) {
    const root = path.join(VAULT, "places");
    const notes = [];
    const types = type === "all"
        ? fs.readdirSync(root).filter((d) => !d.startsWith("_") && !d.startsWith(".") && fs.statSync(path.join(root, d)).isDirectory() && !d.endsWith(".json"))
        : [type];

    for (const t of types) {
        const typePath = path.join(root, t);
        if (!fs.existsSync(typePath)) continue;

        // Nested bars: places/bar/{primaryType}/{hood}/*.md
        // Flat: places/{type}/{hood}/*.md
        const entries = fs.readdirSync(typePath).filter((e) => !e.startsWith("_") && !e.startsWith("."));
        const sampleDir = path.join(typePath, entries[0] || "");
        let nested = false;
        if (entries.length && fs.statSync(sampleDir).isDirectory()) {
            // if first level entries have only directories (or dirs containing dirs with md), treat as nested
            const kids = fs.readdirSync(sampleDir);
            nested = kids.every((k) => !k.endsWith(".md")) && kids.some((k) => fs.statSync(path.join(sampleDir, k)).isDirectory());
            // stronger: if any first-level dir contains only dirs
            if (!nested) {
                nested = entries.every((e) => {
                    const p = path.join(typePath, e);
                    if (!fs.statSync(p).isDirectory()) return false;
                    const sub = fs.readdirSync(p);
                    if (sub.some((x) => x.endsWith(".md"))) return false;
                    return sub.some((x) => fs.statSync(path.join(p, x)).isDirectory());
                });
            }
        }

        if (nested && t === "bar") {
            for (const primaryType of entries) {
                const ptPath = path.join(typePath, primaryType);
                if (!fs.statSync(ptPath).isDirectory()) continue;
                for (const hood of fs.readdirSync(ptPath)) {
                    if (hood.startsWith("_") || hood.startsWith(".")) continue;
                    const hoodPath = path.join(ptPath, hood);
                    if (!fs.statSync(hoodPath).isDirectory()) continue;
                    for (const f of fs.readdirSync(hoodPath)) {
                        if (!f.endsWith(".md")) continue;
                        try {
                            const raw = fs.readFileSync(path.join(hoodPath, f), "utf8");
                            const parsed = matter(raw);
                            notes.push({ data: parsed.data, content: parsed.content, file: f, type: t, hood, primaryType });
                        } catch (e) {
                            console.warn(`  skip ${t}/${primaryType}/${hood}/${f}: ${e.message}`);
                        }
                    }
                }
            }
        } else {
            for (const hood of entries) {
                const hoodPath = path.join(typePath, hood);
                if (!fs.statSync(hoodPath).isDirectory()) continue;
                for (const f of fs.readdirSync(hoodPath)) {
                    if (!f.endsWith(".md")) continue;
                    try {
                        const raw = fs.readFileSync(path.join(hoodPath, f), "utf8");
                        const parsed = matter(raw);
                        notes.push({
                            data: parsed.data,
                            content: parsed.content,
                            file: f,
                            type: t,
                            hood,
                            primaryType: parsed.data.google_primary_type || null,
                        });
                    } catch (e) {
                        console.warn(`  skip ${t}/${hood}/${f}: ${e.message}`);
                    }
                }
            }
        }
    }
    return notes;
}

function toRow(note) {
    const d = note.data;
    const slug = d.slug || path.basename(note.file, ".md");
    const name = d.name || slug;
    const lat = d.coordinates?.lat ?? null;
    const lng = d.coordinates?.lng ?? null;
    const hours = d.hours && typeof d.hours === "object" ? JSON.stringify(d.hours) : null;
    const cuisine = Array.isArray(d.cuisine) ? d.cuisine : [];
    const tags = Array.isArray(d.tags) ? d.tags : [];
    const googleTypes = Array.isArray(d.google_types) ? d.google_types : [];

    // Extract ## Menu section body if present (for future menu_md use)
    let menuMd = null;
    const menuMatch = note.content.match(/^## Menu\s*\n([\s\S]*?)(?=\n## |$)/m);
    if (menuMatch) menuMd = menuMatch[1].trim();

    return {
        slug,
        name,
        type: d.type || note.type,
        neighborhood: d.neighborhood || note.hood,
        address: d.address || null,
        lat,
        lng,
        smoking: d.smoking || null,
        price_range: d.price_range || null,
        cuisine,
        tags,
        website: d.website || null,
        phone: d.phone || null,
        hours,
        opening_hours_raw: d.opening_hours_raw || null,
        google_place_id: d.google_place_id || null,
        google_name: d.google_name || null,
        google_verified: d.google_verified ?? null,
        google_rating: d.google_rating ?? null,
        google_user_ratings_total: d.google_user_ratings_total ?? null,
        google_types: googleTypes,
        google_primary_type: d.google_primary_type || null,
        google_primary_type_display: d.google_primary_type_display || null,
        source: d.source || null,
        source_id: d.source_id || null,
        menu_md: menuMd,
    };
}

const UPSERT_SQL = `
INSERT INTO places (
    slug, name, type, neighborhood, address, lat, lng,
    smoking, price_range, cuisine, tags, website, phone,
    hours, opening_hours_raw,
    google_place_id, google_name, google_verified, google_rating, google_user_ratings_total,
    google_types, google_primary_type, google_primary_type_display,
    source, source_id, menu_md
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12, $13,
    $14::jsonb, $15,
    $16, $17, $18, $19, $20,
    $21::text[], $22, $23,
    $24, $25, $26
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    neighborhood = EXCLUDED.neighborhood,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    smoking = EXCLUDED.smoking,
    price_range = EXCLUDED.price_range,
    cuisine = EXCLUDED.cuisine,
    tags = EXCLUDED.tags,
    website = EXCLUDED.website,
    phone = EXCLUDED.phone,
    hours = EXCLUDED.hours,
    opening_hours_raw = EXCLUDED.opening_hours_raw,
    google_place_id = EXCLUDED.google_place_id,
    google_name = EXCLUDED.google_name,
    google_verified = EXCLUDED.google_verified,
    google_rating = EXCLUDED.google_rating,
    google_user_ratings_total = EXCLUDED.google_user_ratings_total,
    google_types = EXCLUDED.google_types,
    google_primary_type = EXCLUDED.google_primary_type,
    google_primary_type_display = EXCLUDED.google_primary_type_display,
    source = EXCLUDED.source,
    source_id = EXCLUDED.source_id,
    menu_md = EXCLUDED.menu_md,
    updated_at = NOW()
`;

async function main() {
    const args = parseArgs(process.argv);
    console.log(`Migrating type="${args.type}" from ${VAULT}/places → PostgreSQL`);

    const notes = collectNotes(args.type);
    console.log(`Parsed ${notes.length} notes`);

    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
        console.log("Ensuring schema…");
        await client.query(SCHEMA);

        let inserted = 0;
        let updated = 0;
        let skipped = 0;

        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            try {
                const row = toRow(note);
                if (!row.name || row.lat == null || row.lng == null) {
                    skipped++;
                    continue;
                }
                const existing = await client.query("SELECT id FROM places WHERE slug = $1", [row.slug]);
                const wasUpdate = existing.rows.length > 0;
                await client.query(UPSERT_SQL, [
                    row.slug, row.name, row.type, row.neighborhood, row.address, row.lat, row.lng,
                    row.smoking, row.price_range, row.cuisine, row.tags, row.website, row.phone,
                    row.hours, row.opening_hours_raw,
                    row.google_place_id, row.google_name, row.google_verified, row.google_rating, row.google_user_ratings_total,
                    row.google_types, row.google_primary_type, row.google_primary_type_display,
                    row.source, row.source_id, row.menu_md,
                ]);
                if (wasUpdate) updated++; else inserted++;
            } catch (e) {
                skipped++;
                console.warn(`  fail ${note.file}: ${e.message}`);
            }
            if ((i + 1) % 200 === 0 || i === notes.length - 1) {
                console.log(`  ${i + 1}/${notes.length} — inserted=${inserted} updated=${updated} skipped=${skipped}`);
            }
        }

        const countRes = await client.query("SELECT type, COUNT(*) FROM places GROUP BY type ORDER BY type");
        console.log("\nTable counts:");
        for (const r of countRes.rows) console.log(`  ${r.type}: ${r.count}`);

        console.log(`\nDone. inserted=${inserted} updated=${updated} skipped=${skipped}`);
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
