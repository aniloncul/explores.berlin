#!/usr/bin/env node
/**
 * Reclaim Google-rejected place notes by matching on address/coordinates.
 * Names often differ on Google Maps; address is the source of truth.
 *
 * Usage:
 *   node scripts/vault/reclaim.js
 *   node scripts/vault/reclaim.js --dry-run
 *   node scripts/vault/reclaim.js --delay 150 --radius 80
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env.local") });

const {
    placesDetails,
    placesDetailsNew,
    placesNearby,
    placesTextSearch,
    googleResultToPatch,
    normalize,
    extractStreet,
} = require("./google");
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

const ADDRESS_ONLY = new Set([
    "street_address", "premise", "subpremise", "route", "intersection",
    "postal_code", "neighborhood", "locality", "political", "country",
    "geocode", "plus_code",
]);

const FOOD_DRINK = new Set([
    "cafe", "coffee_shop", "bakery", "restaurant", "bar", "pub",
    "night_club", "meal_takeaway", "meal_delivery", "food", "liquor_store",
]);

function isAddressOnly(types) {
    if (!Array.isArray(types) || !types.length) return true;
    return types.every(
        (t) => ADDRESS_ONLY.has(t) || t === "establishment" || t === "point_of_interest"
    );
}

function hasFoodDrink(types) {
    if (!Array.isArray(types)) return false;
    return types.some((t) => FOOD_DRINK.has(t));
}

function parseArgs(argv) {
    const args = { dryRun: false, delay: 150, radius: 80 };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--dry-run") args.dryRun = true;
        else if (a === "--delay") args.delay = Number(argv[++i]);
        else if (a === "--radius") args.radius = Number(argv[++i]);
        else if (a === "--help" || a === "-h") {
            console.log("Usage: node scripts/vault/reclaim.js [--dry-run] [--delay ms] [--radius m]");
            process.exit(0);
        }
    }
    if (Number.isNaN(args.delay)) args.delay = 150;
    if (Number.isNaN(args.radius)) args.radius = 80;
    return args;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function slugify(name) {
    return String(name)
        .normalize("NFC")
        .toLowerCase()
        .replace(/ß/g, "ss")
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);
}

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

function extractZip(address) {
    const m = String(address || "").match(/\b\d{5}\b/);
    return m ? m[0] : null;
}

function normalizeStreet(s) {
    return normalize(s)
        .replace(/strasse/g, "str")
        .replace(/\bstr\b/g, "str")
        .replace(/\s+/g, " ")
        .trim();
}

function addressScore(gAddr, noteAddr) {
    if (!gAddr || !noteAddr) return 0;
    const g = normalize(gAddr);
    const n = normalize(noteAddr);
    if (!g || !n) return 0;
    let score = 0;
    const street = normalizeStreet(extractStreet(noteAddr));
    const zip = extractZip(noteAddr);
    if (street && (g.includes(street) || normalizeStreet(g).includes(street))) score += 50;
    if (zip && g.includes(zip)) score += 30;
    if (g.includes(n) || n.includes(g)) score += 40;
    const gStreet = normalizeStreet(extractStreet(gAddr));
    if (gStreet && normalizeStreet(n).includes(gStreet)) score += 20;
    return Math.min(score, 100);
}

function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

function nameScore(gName, noteName) {
    const strip = (s) =>
        normalize(s)
            .replace(/[^a-z0-9]+/g, "")
            .trim();
    const g = strip(gName);
    const n = strip(noteName);
    if (!g || !n) return 0;
    if (g === n) return 50;
    if (g.includes(n) || n.includes(g)) return 35;

    const stop = new Set(["und", "and", "der", "die", "das", "the", "of", "nr", "no"]);
    const toks = (s) =>
        normalize(s)
            .split(/[^a-z0-9]+/)
            .filter((t) => t && !stop.has(t));
    const gt = new Set(toks(gName));
    const nt = toks(noteName);
    if (!nt.length) return 0;
    const hit = nt.filter((t) => gt.has(t) || [...gt].some((x) => x.includes(t) || t.includes(x))).length;
    let score = Math.round((hit / nt.length) * 25);

    const digitsG = (normalize(gName).match(/\d+/g) || []).join("");
    const digitsN = (normalize(noteName).match(/\d+/g) || []).join("");
    if (digitsG && digitsN && digitsG === digitsN) score += 20;

    return Math.min(score, 50);
}

function isConfident(match, { address, lat, lng }, minScore) {
    if (!match || !match.place?.place_id) return false;
    if (match.score < minScore) return false;
    const p = match.place;
    const types = p.types || [];
    if (isAddressOnly(types) || !hasFoodDrink(types)) return false;

    const aScore = addressScore(p.formatted_address, address);
    const nScore = nameScore(p.name, match.noteName || "");
    let dist = null;
    if (lat != null && p.geometry?.location) {
        dist = haversineMeters(
            lat,
            lng,
            p.geometry.location.lat,
            p.geometry.location.lng
        );
    }

    if (address && aScore >= 50 && (dist == null || dist <= 150)) return true;
    if (nScore >= 30 && (dist == null || dist <= 100)) return true;
    if (dist != null && dist <= 40 && (aScore >= 20 || nScore >= 15 || hasFoodDrink(types))) {
        if (nScore >= 10 || aScore >= 20 || !address) return true;
    }
    if (dist != null && dist <= 100 && aScore >= 40) return true;
    if (dist != null && dist <= 50 && nScore >= 20 && hasFoodDrink(types)) return true;
    if (match.score >= minScore && aScore >= 50 && hasFoodDrink(types)) return true;
    return false;
}

function pickCandidate(candidates, { name, address, lat, lng }) {
    let best = null;
    let bestScore = -1;
    for (const c of candidates) {
        if (!c.place_id) continue;
        const types = c.types || [];
        if (isAddressOnly(types)) continue;
        if (!hasFoodDrink(types)) continue;
        let score = 0;
        score += addressScore(c.formatted_address, address);
        if (lat != null && c.geometry?.location) {
            const d = haversineMeters(
                lat,
                lng,
                c.geometry.location.lat,
                c.geometry.location.lng
            );
            if (d <= 30) score += 40;
            else if (d <= 60) score += 25;
            else if (d <= 100) score += 10;
            else if (d <= 200) score += 0;
            else score -= 30;
        }
        score += nameScore(c.name, name);
        if (mapGoogleTypes(types)) score += 20;
        if (score > bestScore) {
            bestScore = score;
            best = c;
        }
    }
    return best ? { place: best, score: bestScore } : null;
}

function stripRejectedHeader(content) {
    return content
        .replace(/^#[^\n]*\n+/, "")
        .replace(/^Rejected:[^\n]*\n+/, "")
        .replace(/^\n+/, "");
}

function replaceTypeLink(content, newType) {
    const display = TYPE_DISPLAY[newType];
    if (!display) return content;
    return content.replace(/\[\[(Bar|Cafe|Restaurant)\]\]/, `[[${display}]]`);
}

function loadRejectedNotes() {
    const rejectRoot = path.join(VAULT, "places");
    const notes = [];
    for (const typeDir of fs.readdirSync(rejectRoot)) {
        if (typeDir.startsWith("_")) continue;
        const noGoogle = path.join(rejectRoot, typeDir, "_no_google");
        if (!fs.existsSync(noGoogle)) continue;
        for (const hood of fs.readdirSync(noGoogle)) {
            const hoodPath = path.join(noGoogle, hood);
            if (!fs.statSync(hoodPath).isDirectory()) continue;
            for (const f of fs.readdirSync(hoodPath)) {
                if (!f.endsWith(".md")) continue;
                const full = path.join(hoodPath, f);
                try {
                    const parsed = matter(fs.readFileSync(full, "utf8"));
                    notes.push({
                        file: full,
                        typeDir,
                        hood,
                        data: parsed.data,
                        content: parsed.content,
                        slug: f.replace(/\.md$/, ""),
                    });
                } catch (e) {
                    console.warn(`skip unreadable: ${full}: ${e.message}`);
                }
            }
        }
    }
    return notes;
}

async function findGoogleMatch(note, radius) {
    const { data } = note;
    const candidates = new Map();

    if (data.coordinates?.lat != null && data.coordinates?.lng != null) {
        try {
            const nearby = await placesNearby(
                data.coordinates.lat,
                data.coordinates.lng,
                radius
            );
            for (const p of nearby.results || []) {
                if (p.place_id) candidates.set(p.place_id, p);
            }
        } catch (e) {
            console.warn(`  nearby failed: ${e.message}`);
        }
        await sleep(100);
    }

    if (data.address) {
        try {
            const search = await placesTextSearch(`${data.address}, Berlin`);
            for (const p of search.results || []) {
                if (p.place_id && !candidates.has(p.place_id)) {
                    candidates.set(p.place_id, p);
                }
            }
        } catch (e) {
            console.warn(`  textsearch failed: ${e.message}`);
        }
        await sleep(100);
        try {
            const q = [data.name, data.address, "Berlin"].filter(Boolean).join(", ");
            const search2 = await placesTextSearch(q);
            for (const p of search2.results || []) {
                if (p.place_id && !candidates.has(p.place_id)) {
                    candidates.set(p.place_id, p);
                }
            }
        } catch (e) {
            console.warn(`  textsearch2 failed: ${e.message}`);
        }
        await sleep(100);
    }

    if (!candidates.size) return null;

    const list = [...candidates.values()];
    // Rough pre-score to rank, then enrich top candidates with Details
    const rough = (c) => {
        let s = addressScore(c.formatted_address, data.address);
        if (data.coordinates?.lat != null && c.geometry?.location) {
            const d = haversineMeters(
                data.coordinates.lat,
                data.coordinates.lng,
                c.geometry.location.lat,
                c.geometry.location.lng
            );
            if (d <= 30) s += 40;
            else if (d <= 60) s += 25;
            else if (d <= 100) s += 10;
            else if (d > 200) s -= 30;
        }
        s += nameScore(c.name, data.name);
        if (mapGoogleTypes(c.types || [])) s += 20;
        if (isAddressOnly(c.types || []) || !hasFoodDrink(c.types || [])) s -= 100;
        return s;
    };
    list.sort((a, b) => rough(b) - rough(a));

    const top = list.slice(0, 5);
    const enriched = [];
    for (const c of top) {
        let place = c;
        try {
            const details = await placesDetails(c.place_id);
            place = { ...c, ...(details.result || {}) };
        } catch {
            /* keep partial */
        }
        enriched.push(place);
        await sleep(80);
    }

    const match = pickCandidate(enriched, {
        name: data.name,
        address: data.address,
        lat: data.coordinates?.lat,
        lng: data.coordinates?.lng,
    });
    if (!match) return null;
    match.noteName = data.name;
    return match;
}

async function main() {
    const args = parseArgs(process.argv);
    const notes = loadRejectedNotes();
    console.log(`Found ${notes.length} rejected notes in _no_google`);
    if (args.dryRun) console.log("[dry-run] no files will be written\n");

    const report = {
        reclaimed: [],
        stillRejected: [],
        errors: [],
        moved: { bar: 0, cafe: 0, restaurant: 0 },
        unmapped: [],
    };
    const reclaimedSourceIds = new Set();

    let i = 0;
    for (const note of notes) {
        i++;
        const { data } = note;
        const label = `${i}/${notes.length} ${data.name || note.slug}`;
        try {
            const match = await findGoogleMatch(note, args.radius);
            const confident = isConfident(
                match,
                {
                    address: data.address,
                    lat: data.coordinates?.lat,
                    lng: data.coordinates?.lng,
                },
                50
            );

            if (!match || !confident) {
                report.stillRejected.push({
                    name: data.name,
                    score: match ? match.score : 0,
                    near: match?.place?.name || data.google_reject_near || null,
                    address: data.address,
                });
                console.log(`  ${label} → still no match (score=${match ? match.score : 0}${match ? `, near=${match.place.name}` : ""})`);
                await sleep(args.delay);
                continue;
            }

            const details = await placesDetails(match.place.place_id);
            const result = { ...match.place, ...(details.result || {}) };
            const types = Array.isArray(result.types) ? result.types : [];
            let primaryType = null;
            try {
                const n = await placesDetailsNew(match.place.place_id);
                primaryType = n.primaryType || null;
                if (Array.isArray(n.types) && n.types.length) {
                    types.length = 0;
                    types.push(...n.types);
                }
            } catch { /* fall back to legacy types + priority */ }
            let newType = mapGoogleTypes(types, primaryType);
            if (!newType && hasFoodDrink(types)) {
                newType = data.type || note.typeDir;
            }
            if (!newType) {
                report.stillRejected.push({
                    name: data.name,
                    score: match.score,
                    near: result.name,
                    address: data.address,
                    reason: "no mappable venue type",
                });
                console.log(`  ${label} → reject (types=${types.join(",")})`);
                await sleep(args.delay);
                continue;
            }

            const oldName = data.name;
            const oldSlug = note.slug;
            const googleName = result.name || oldName;
            let newSlug = slugify(googleName) || oldSlug;
            if (primaryType) data.google_primary_type = primaryType;
            const destDir = newType === "bar"
                ? path.join(VAULT, "places", "bar", data.google_primary_type || "bar", note.hood)
                : path.join(VAULT, "places", newType, note.hood);
            let dest = path.join(destDir, `${newSlug}.md`);
            if (fs.existsSync(dest) && dest !== note.file) {
                let n = 2;
                while (fs.existsSync(path.join(destDir, `${newSlug}_${n}.md`))) n++;
                newSlug = `${newSlug}_${n}`;
                dest = path.join(destDir, `${newSlug}.md`);
            }

            if (normalize(googleName) !== normalize(oldName)) {
                const aliases = Array.isArray(data.aliases) ? data.aliases.slice() : [];
                if (oldName && !aliases.includes(oldName)) aliases.push(oldName);
                data.aliases = aliases;
                data.osm_name = data.osm_name || oldName;
            }
            data.name = googleName;
            data.slug = newSlug;
            data.type = newType;
            data.google_place_id = result.place_id;
            data.google_name = googleName;
            data.google_verified = true;
            data.google_types = types;
            delete data.google_rejected;
            delete data.google_reject_score;
            delete data.google_reject_near;

            const patch = googleResultToPatch(result);
            for (const [k, v] of Object.entries(patch)) {
                if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) {
                    if (data[k] == null || data[k] === "" || (Array.isArray(data[k]) && !data[k].length)) {
                        data[k] = v;
                    } else if (k === "address" && result.formatted_address) {
                        data[k] = result.formatted_address;
                    } else if (k === "hours" && data.hours && Object.values(data.hours).every((x) => !x)) {
                        data[k] = v;
                    } else if (k === "opening_hours_raw" && !data.opening_hours_raw) {
                        data[k] = v;
                    } else if (k === "phone" && !data.phone) {
                        data[k] = v;
                    } else if (k === "website" && !data.website) {
                        data[k] = v;
                    } else if (k === "price_range" && !data.price_range) {
                        data[k] = v;
                    }
                }
            }
            if (result.formatted_address) data.address = result.formatted_address;

            let content = stripRejectedHeader(note.content);
            content = replaceTypeLink(content, newType);

            report.reclaimed.push({
                from: oldName,
                googleName,
                types,
                newType,
                score: match.score,
                address: data.address,
            });
            report.moved[newType] = (report.moved[newType] || 0) + 1;
            if (data.source_id) reclaimedSourceIds.add(String(data.source_id));

            console.log(`  ${label} → "${googleName}" [${newType}] score=${match.score} (${types.slice(0, 4).join(",")})`);

            if (!args.dryRun) {
                fs.mkdirSync(destDir, { recursive: true });
                fs.writeFileSync(dest, matter.stringify(content, data), "utf8");
                if (fs.existsSync(note.file) && note.file !== dest) fs.unlinkSync(note.file);
            }

            await sleep(args.delay);
        } catch (e) {
            report.errors.push({ name: data.name, error: String(e.message || e) });
            console.error(`  ${label} ERROR: ${e.message || e}`);
            await sleep(500);
        }
    }

    if (!args.dryRun && reclaimedSourceIds.size) {
        const listPath = path.join(VAULT, "places", "bar", "_no_google", "kreuzberg-rejected.json");
        if (fs.existsSync(listPath)) {
            try {
                const raw = JSON.parse(fs.readFileSync(listPath, "utf8"));
                const before = (raw.source_ids || []).length;
                raw.source_ids = (raw.source_ids || []).filter((id) => !reclaimedSourceIds.has(String(id)));
                raw.updated = new Date().toISOString();
                raw.reclaimed_count = (raw.reclaimed_count || 0) + (before - raw.source_ids.length);
                fs.writeFileSync(listPath, JSON.stringify(raw, null, 2), "utf8");
                console.log(`\nDenylist: ${before} → ${raw.source_ids.length} (removed ${before - raw.source_ids.length})`);
            } catch (e) {
                console.warn(`denylist update failed: ${e.message}`);
            }
        }
    }

    const summary = `
Done.${args.dryRun ? " (dry-run)" : ""}
  reclaimed:     ${report.reclaimed.length}
  still rejected:${report.stillRejected.length}
  errors:        ${report.errors.length}
  moved → bar=${report.moved.bar || 0} cafe=${report.moved.cafe || 0} restaurant=${report.moved.restaurant || 0}`;
    console.log(summary);

    if (report.reclaimed.length) {
        console.log(`\nReclaimed:`);
        for (const m of report.reclaimed) {
            console.log(`  - ${m.from} → "${m.googleName}" [${m.newType}] score=${m.score}`);
        }
    }
    if (report.stillRejected.length) {
        console.log(`\nStill rejected:`);
        for (const m of report.stillRejected) {
            console.log(`  - ${m.name} score=${m.score}${m.near ? ` near="${m.near}"` : ""} addr=${m.address || "(none)"}`);
        }
    }
    if (report.errors.length) {
        console.log(`\nErrors:`);
        for (const m of report.errors) console.log(`  - ${m.name}: ${m.error}`);
    }

    if (!args.dryRun) {
        const reportPath = path.join(VAULT, "places", "reclaim-report.json");
        fs.writeFileSync(reportPath, JSON.stringify({
            updated: new Date().toISOString(),
            ...report,
        }, null, 2), "utf8");
        console.log(`\nReport: ${reportPath}`);
    }
}

main().catch((err) => {
    console.error("Reclaim failed:", err);
    process.exit(1);
});
