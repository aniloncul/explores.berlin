#!/usr/bin/env node
/**
 * Fetch Google place photos → public/images/places/{slug}/ + vault frontmatter.
 *
 * Usage:
 *   node scripts/vault/fetch_images.js
 *   node scripts/vault/fetch_images.js --type restaurant
 *   node scripts/vault/fetch_images.js --type all --max 500 --delay 120
 *   node scripts/vault/fetch_images.js --dry-run
 *
 * Downloads 1 cover photo per place by default (ListingCard uses images[0]).
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env.local") });

const { placesDetails, downloadPlacePhoto } = require("./google");

const VAULT = process.env.OBSIDIAN_VAULT_PATH;
const PROJECT = path.resolve(__dirname, "../..");
const PUBLIC_IMG = path.join(PROJECT, "public", "images", "places");

if (!VAULT || !fs.existsSync(VAULT)) {
    console.error("OBSIDIAN_VAULT_PATH missing or not found:", VAULT);
    process.exit(1);
}

function parseArgs(argv) {
    const args = {
        type: "all",
        max: 0, // 0 = unlimited
        delay: 120,
        photos: 1,
        width: 800,
        dryRun: false,
        force: false,
        help: false,
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--type") args.type = String(argv[++i]);
        else if (a === "--max") args.max = Number(argv[++i]) || 0;
        else if (a === "--delay") args.delay = Number(argv[++i]) || 120;
        else if (a === "--photos") args.photos = Math.max(1, Number(argv[++i]) || 1);
        else if (a === "--width") args.width = Number(argv[++i]) || 800;
        else if (a === "--dry-run") args.dryRun = true;
        else if (a === "--force") args.force = true;
        else if (a === "--help" || a === "-h") args.help = true;
    }
    return args;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function walkNotes(type) {
    const root = path.join(VAULT, "places");
    const types =
        type === "all"
            ? fs
                .readdirSync(root)
                .filter((d) => {
                    const p = path.join(root, d);
                    return (
                        !d.startsWith("_") &&
                        !d.startsWith(".") &&
                        !d.endsWith(".json") &&
                        fs.statSync(p).isDirectory()
                    );
                })
            : [type];

    const notes = [];
    for (const t of types) {
        const typePath = path.join(root, t);
        if (!fs.existsSync(typePath)) continue;
        (function walk(dir) {
            for (const entry of fs.readdirSync(dir)) {
                if (entry.startsWith("_") || entry.startsWith(".")) continue;
                const full = path.join(dir, entry);
                let st;
                try {
                    st = fs.statSync(full);
                } catch {
                    continue;
                }
                if (st.isDirectory()) walk(full);
                else if (entry.endsWith(".md")) {
                    try {
                        const raw = fs.readFileSync(full, "utf8");
                        const parsed = matter(raw);
                        notes.push({
                            file: full,
                            data: parsed.data,
                            content: parsed.content,
                            type: t,
                        });
                    } catch {
                        /* skip bad md */
                    }
                }
            }
        })(typePath);
    }
    return notes;
}

function placeIdOf(data) {
    if (data.google_place_id) return String(data.google_place_id);
    const sid = data.source_id || "";
    if (typeof sid === "string" && sid.startsWith("place/")) {
        return sid.slice("place/".length);
    }
    return null;
}

function hasImages(data, file) {
    if (Array.isArray(data.images) && data.images.length) return true;
    const slug = data.slug || path.basename(file, ".md");
    const dir = path.join(PUBLIC_IMG, slug);
    try {
        return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => /\.(jpe?g|png|webp)$/i.test(f));
    } catch {
        return false;
    }
}

function extFor(contentType) {
    if (/png/i.test(contentType)) return "png";
    if (/webp/i.test(contentType)) return "webp";
    if (/gif/i.test(contentType)) return "gif";
    return "jpg";
}

function setFrontmatterImages(file, data, content, imagePaths) {
    const next = { ...data, images: imagePaths };
    const rebuilt = matter.stringify(content, next, {
        quotingType: '"',
        forceQuotes: false,
    });
    fs.writeFileSync(file, rebuilt, "utf8");
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        console.log(
            `Usage: node scripts/vault/fetch_images.js [--type all|bar|restaurant|cafe] [--max n] [--delay ms] [--photos n] [--width px] [--dry-run] [--force]`
        );
        process.exit(0);
    }

    const stats = {
        scanned: 0,
        skippedHasImages: 0,
        skippedNoPlaceId: 0,
        detailsFetched: 0,
        noPhotos: 0,
        downloaded: 0,
        notesUpdated: 0,
        errors: 0,
    };

    let notes = walkNotes(args.type);
    stats.scanned = notes.length;
    console.log(`Scanned ${notes.length} notes (type=${args.type})`);

    const queue = [];
    for (const n of notes) {
        const id = placeIdOf(n.data);
        if (!id) {
            stats.skippedNoPlaceId++;
            continue;
        }
        if (!args.force && hasImages(n.data, n.file)) {
            stats.skippedHasImages++;
            continue;
        }
        queue.push({ ...n, placeId: id });
    }

    if (args.max > 0) queue.length = Math.min(queue.length, args.max);
    console.log(`Queue: ${queue.length} (has images=${stats.skippedHasImages}, no id=${stats.skippedNoPlaceId})`);

    if (args.dryRun) {
        for (const q of queue.slice(0, 20)) {
            console.log(`  - ${q.data.name || q.file} (${q.placeId})`);
        }
        if (queue.length > 20) console.log(`  … +${queue.length - 20} more`);
        console.log(JSON.stringify(stats, null, 2));
        return;
    }

    fs.mkdirSync(PUBLIC_IMG, { recursive: true });

    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
            const det = await placesDetails(item.placeId);
            stats.detailsFetched++;
            const photos = (det.result && det.result.photos) || [];
            if (!photos.length) {
                stats.noPhotos++;
                await sleep(args.delay);
                continue;
            }

            const slug =
                item.data.slug || path.basename(item.file, ".md");
            const outDir = path.join(PUBLIC_IMG, slug);
            fs.mkdirSync(outDir, { recursive: true });

            const imagePaths = [];
            const wanted = photos.slice(0, args.photos); // cover only: default 1
            for (let p = 0; p < wanted.length; p++) {
                try {
                    const { buffer, contentType } = await downloadPlacePhoto(
                        wanted[p].photo_reference,
                        { maxwidth: args.width }
                    );
                    if (!buffer.length) continue;
                    const ext = extFor(contentType);
                    const fileName = `${p + 1}.${ext}`;
                    fs.writeFileSync(path.join(outDir, fileName), buffer);
                    imagePaths.push(`/images/places/${slug}/${fileName}`);
                    stats.downloaded++;
                    await sleep(80);
                } catch (e) {
                    stats.errors++;
                    console.warn(`  photo fail ${slug} #${p + 1}: ${e.message}`);
                }
            }

            if (imagePaths.length) {
                // Keep only cover file(s) for this run's --photos count
                for (const f of fs.readdirSync(outDir)) {
                    const m = f.match(/^(\d+)\./);
                    if (m && Number(m[1]) > args.photos) {
                        fs.unlinkSync(path.join(outDir, f));
                    }
                }
                setFrontmatterImages(item.file, item.data, item.content, imagePaths);
                stats.notesUpdated++;
            }

            if ((i + 1) % 25 === 0 || i === queue.length - 1) {
                console.log(
                    `  ${i + 1}/${queue.length} — downloaded=${stats.downloaded} notes=${stats.notesUpdated} errors=${stats.errors}`
                );
            }
            await sleep(args.delay);
        } catch (e) {
            stats.errors++;
            console.error(`  fail ${item.data.name || item.placeId}: ${e.message}`);
            await sleep(400);
        }
    }

    const reportPath = path.join(VAULT, "places", "fetch-images-report.json");
    fs.writeFileSync(
        reportPath,
        JSON.stringify({ updated: new Date().toISOString(), ...stats, queue: queue.length }, null, 2),
        "utf8"
    );

    console.log(`
Done.
  scanned:            ${stats.scanned}
  skipped (has img):  ${stats.skippedHasImages}
  skipped (no id):    ${stats.skippedNoPlaceId}
  queue:              ${queue.length}
  details fetched:    ${stats.detailsFetched}
  no photos:          ${stats.noPhotos}
  images downloaded:  ${stats.downloaded}
  notes updated:      ${stats.notesUpdated}
  errors:             ${stats.errors}
  report:             ${reportPath}
`);
}

main().catch((err) => {
    console.error("Fetch images failed:", err);
    process.exit(1);
});
