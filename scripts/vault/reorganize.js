#!/usr/bin/env node
/**
 * Recategorize vault place notes using validated Google Maps place types.
 *
 * Usage:
 *   node scripts/vault/reorganize.js
 *   node scripts/vault/reorganize.js --dry-run
 *   node scripts/vault/reorganize.js --delay 150
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env.local") });

const { placesDetailsNew } = require("./google");
const areas = require("./areas.json");

const VAULT = process.env.OBSIDIAN_VAULT_PATH;
if (!VAULT || !fs.existsSync(VAULT)) {
    console.error("OBSIDIAN_VAULT_PATH missing or not found:", VAULT);
    process.exit(1);
}

const TYPE_DISPLAY = { bar: "Bar", cafe: "Cafe", restaurant: "Restaurant" };

const GOOGLE_TYPE_MAP = {
    cafe: "cafe",
    coffee_shop: "cafe",
    bakery: "cafe",
    restaurant: "restaurant",
    meal_takeaway: "restaurant",
    meal_delivery: "restaurant",
    bar: "bar",
    pub: "bar",
    night_club: "bar",
    nightclub: "bar",
};

/**
 * Map Google's primaryType (Places New) or legacy types[] → vault type.
 * Priority when only legacy types exist (alphabetical, not ranked):
 * restaurant > cafe > bar — matches how Google Maps labels venues.
 */
function mapGoogleTypes(types, primaryType) {
    const pt = String(primaryType || "").toLowerCase();
    if (pt) {
        if (pt === "cafe" || pt === "coffee_shop" || pt === "bakery" || pt.includes("cafe") || pt.includes("coffee")) {
            return "cafe";
        }
        if (pt.includes("restaurant") || pt === "meal_takeaway" || pt === "meal_delivery" || pt.includes("bistro") || pt.includes("grill")) {
            return "restaurant";
        }
        if (pt === "bar" || pt === "pub" || pt === "night_club" || pt === "cocktail_bar" || pt.includes("bar") || pt.includes("club") || pt.includes("pub")) {
            return "bar";
        }
        // primaryType known but outside hospitality — fall through to types[]
    }
    if (!Array.isArray(types)) return null;
    const set = new Set(types);
    if (set.has("restaurant") || set.has("meal_takeaway") || set.has("meal_delivery")) return "restaurant";
    if (set.has("cafe") || set.has("coffee_shop") || set.has("bakery")) return "cafe";
    for (const t of types) {
        if (GOOGLE_TYPE_MAP[t]) return GOOGLE_TYPE_MAP[t];
    }
    return null;
}

function parseArgs(argv) {
    const args = { dryRun: false, delay: 150 };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--dry-run") args.dryRun = true;
        else if (a === "--delay") args.delay = Number(argv[++i]);
        else if (a === "--help" || a === "-h") {
            console.log(`Usage: node scripts/vault/reorganize.js [--dry-run] [--delay ms]`);
            process.exit(0);
        }
    }
    if (Number.isNaN(args.delay)) args.delay = 150;
    return args;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function loadNotes() {
    const notes = [];
    const placesRoot = path.join(VAULT, "places");
    for (const typeDir of fs.readdirSync(placesRoot)) {
        if (typeDir.startsWith("_")) continue;
        const typePath = path.join(placesRoot, typeDir);
        if (!fs.statSync(typePath).isDirectory()) continue;
        // Nested: places/bar/{primaryType}/{hood}/*.md — flat: places/{type}/{hood}/*.md
        for (const mid of fs.readdirSync(typePath)) {
            if (mid.startsWith("_")) continue;
            const midPath = path.join(typePath, mid);
            if (!fs.statSync(midPath).isDirectory()) continue;
            const midIsDir = fs.readdirSync(midPath).some((x) =>
                x.endsWith(".md") || (fs.statSync(path.join(midPath, x)).isDirectory())
            );
            if (!midIsDir) continue;

            const midHasMd = fs.readdirSync(midPath).some((x) => x.endsWith(".md"));
            const midHasHoodDirs = fs.readdirSync(midPath).some((x) =>
                x.endsWith(".md") ? false : fs.statSync(path.join(midPath, x)).isDirectory()
            );

            // If mid contains hood subdirs (and no direct md, or only hood-like), treat as primaryType
            if (!midHasMd && midHasHoodDirs) {
                for (const hood of fs.readdirSync(midPath)) {
                    if (hood.startsWith("_")) continue;
                    const hoodPath = path.join(midPath, hood);
                    if (!fs.statSync(hoodPath).isDirectory()) continue;
                    collectMdFiles(hoodPath, notes, { typeDir, hood, primaryType: mid });
                }
            } else if (midHasMd) {
                // flat: mid is hood
                collectMdFiles(midPath, notes, { typeDir, hood: mid, primaryType: null });
            } else {
                // empty-ish: try one more level just in case
                collectMdFiles(midPath, notes, { typeDir, hood: mid, primaryType: null });
            }
        }
    }
    return notes;
}

function collectMdFiles(dirPath, notes, meta) {
    for (const f of fs.readdirSync(dirPath)) {
        if (!f.endsWith(".md")) continue;
        const full = path.join(dirPath, f);
        try {
            const raw = fs.readFileSync(full, "utf8");
            const parsed = matter(raw);
            notes.push({
                file: full,
                dir: dirPath,
                typeDir: meta.typeDir,
                hood: meta.hood,
                primaryType: meta.primaryType || parsed.data.google_primary_type || null,
                data: parsed.data,
                content: parsed.content,
            });
        } catch (e) {
            console.warn(`skip unreadable: ${full}: ${e.message}`);
        }
    }
}

function replaceTypeLink(content, newType) {
    const display = TYPE_DISPLAY[newType];
    if (!display) return content;
    return content.replace(/\[\[(Bar|Cafe|Restaurant)\]\]/, `[[${display}]]`);
}

function destinationFor(newType, hood, fileName, primaryType) {
    if (newType === "bar") {
        const pt = primaryType || "bar";
        return path.join(VAULT, "places", "bar", pt, hood, fileName);
    }
    return path.join(VAULT, "places", newType, hood, fileName);
}

async function main() {
    const args = parseArgs(process.argv);
    const all = loadNotes();
    const queue = all.filter((n) => n.data.google_place_id);
    const skippedNoGoogle = all.length - queue.length;

    console.log(`Found ${all.length} place notes (${queue.length} with google_place_id, ${skippedNoGoogle} skipped)`);
    if (args.dryRun) console.log("[dry-run] no files will be written\n");

    const report = {
        fetched: 0,
        errors: 0,
        unmapped: [],
        stayed: { bar: 0, cafe: 0, restaurant: 0 },
        moved: { bar: [], cafe: [], restaurant: [] },
        failed: [],
    };

    let i = 0;
    for (const note of queue) {
        i++;
        const { data } = note;
        const label = `${i}/${queue.length} ${data.name || path.basename(note.file)}`;
        try {
            const n = await placesDetailsNew(data.google_place_id);
            const primaryType = n.primaryType || null;
            const primaryDisplay = n.primaryTypeDisplayName?.text || null;
            const types = Array.isArray(n.types) ? n.types : [];
            report.fetched++;

            const newType = mapGoogleTypes(types, primaryType);
            const currentType = data.type || note.typeDir;
            data.google_types = types;
            if (primaryType) data.google_primary_type = primaryType;
            if (primaryDisplay) data.google_primary_type_display = primaryDisplay;

            if (!newType) {
                report.unmapped.push({
                    name: data.name,
                    currentType,
                    googleTypes: types,
                    file: note.file,
                });
                if (!args.dryRun) {
                    const rebuilt = matter.stringify(note.content, data);
                    fs.writeFileSync(note.file, rebuilt, "utf8");
                }
                console.log(`  ${label} → unmapped (${types.join(",") || "no types"})`);
                await sleep(args.delay);
                continue;
            }

            if (newType === currentType) {
                report.stayed[newType]++;
                if (!args.dryRun) {
                    const rebuilt = matter.stringify(note.content, data);
                    fs.writeFileSync(note.file, rebuilt, "utf8");
                }
                await sleep(args.delay);
                continue;
            }

            const fileName = path.basename(note.file);
            const dest = destinationFor(newType, note.hood, fileName, primaryType || data.google_primary_type);
            if (fs.existsSync(dest) && dest !== note.file) {
                report.failed.push({ name: data.name, reason: "destination exists", dest });
                console.log(`  ${label} → SKIP (dest exists: ${dest})`);
                await sleep(args.delay);
                continue;
            }

            data.type = newType;
            const newContent = replaceTypeLink(note.content, newType);
            report.moved[newType].push({
                name: data.name,
                from: currentType,
                googleTypes: types,
                file: dest,
            });

            console.log(`  ${label} → ${currentType} ⇒ ${newType} (${types.join(",")})`);

            if (!args.dryRun) {
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                const rebuilt = matter.stringify(newContent, data);
                fs.writeFileSync(dest, rebuilt, "utf8");
                if (dest !== note.file) fs.unlinkSync(note.file);
            }

            await sleep(args.delay);
        } catch (e) {
            report.errors++;
            report.failed.push({ name: data.name, reason: String(e.message || e) });
            console.error(`  ${label} ERROR: ${e.message || e}`);
            await sleep(500);
        }
    }

    const movedTotal = report.moved.bar.length + report.moved.cafe.length + report.moved.restaurant.length;
    console.log(`
Done.${args.dryRun ? " (dry-run)" : ""}
  fetched:     ${report.fetched}
  errors:      ${report.errors}
  unmapped:    ${report.unmapped.length}
  stayed:      bar=${report.stayed.bar} cafe=${report.stayed.cafe} restaurant=${report.stayed.restaurant}
  moved:       ${movedTotal}
    → cafe:        ${report.moved.cafe.length}
    → restaurant:  ${report.moved.restaurant.length}
    → bar:         ${report.moved.bar.length}
  failed:      ${report.failed.length}`);

    if (report.moved.cafe.length) {
        console.log(`\nMoved to cafe:`);
        for (const m of report.moved.cafe) console.log(`  - ${m.name} (${m.googleTypes.join(",")})`);
    }
    if (report.moved.restaurant.length) {
        console.log(`\nMoved to restaurant:`);
        for (const m of report.moved.restaurant) console.log(`  - ${m.name} (${m.googleTypes.join(",")})`);
    }
    if (report.moved.bar.length) {
        console.log(`\nMoved to bar:`);
        for (const m of report.moved.bar) console.log(`  - ${m.name} (${m.googleTypes.join(",")})`);
    }
    if (report.unmapped.length) {
        console.log(`\nUnmapped (kept current type):`);
        for (const m of report.unmapped) console.log(`  - ${m.name} [${m.currentType}] types=${m.googleTypes.join(",") || "(none)"}`);
    }
    if (report.failed.length) {
        console.log(`\nFailed:`);
        for (const m of report.failed) console.log(`  - ${m.name}: ${m.reason}`);
    }

    const reportPath = path.join(VAULT, "places", "reorganize-report.json");
    if (!args.dryRun) {
        fs.writeFileSync(reportPath, JSON.stringify({
            updated: new Date().toISOString(),
            fetched: report.fetched,
            errors: report.errors,
            stayed: report.stayed,
            moved: report.moved,
            unmapped: report.unmapped,
            failed: report.failed,
        }, null, 2), "utf8");
        console.log(`\nReport: ${reportPath}`);
    }
}

main().catch((err) => {
    console.error("Reorganize failed:", err);
    process.exit(1);
});
