#!/usr/bin/env node
/**
 * Google-Maps-only place harvester (no OSM).
 *
 * Usage:
 *   node scripts/vault/harvest_google.js --type bar --neighborhood neukoelln --dry-run
 *   node scripts/vault/harvest_google.js --type bar --neighborhood neukoelln
 *   node scripts/vault/harvest_google.js --type bar --neighborhood neukoelln --max-details 400 --radius 450
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env.local") });

const {
    placesNearby,
    placesTextSearch,
    placesDetails,
    placesDetailsNew,
    parseWeekdayText,
    periodsToHours,
    googlePriceToRange,
} = require("./google");
const { hoursToRows } = require("./hours");
const areas = require("./areas.json");

const VAULT = process.env.OBSIDIAN_VAULT_PATH;
if (!VAULT || !fs.existsSync(VAULT)) {
    console.error("OBSIDIAN_VAULT_PATH missing or not found:", VAULT);
    process.exit(1);
}

const TYPE_DISPLAY = { bar: "Bar", cafe: "Cafe", restaurant: "Restaurant" };
const KEEP_TYPES = {
    bar: new Set(["bar", "pub", "night_club"]),
    cafe: new Set(["cafe", "coffee_shop", "bakery"]),
    restaurant: new Set(["restaurant", "meal_takeaway", "meal_delivery"]),
};
const ADDRESS_ONLY = new Set([
    "street_address", "premise", "subpremise", "route", "intersection",
    "postal_code", "neighborhood", "locality", "political", "country",
    "geocode", "plus_code",
]);
const NEARBY_TYPE = { bar: "bar", cafe: "cafe", restaurant: "restaurant" };

function parseArgs(argv) {
    const args = {
        type: "bar",
        neighborhood: "neukoelln",
        dryRun: false,
        radius: 450,
        maxDetails: 500,
        delay: 150,
        textSearch: true,
        help: false,
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--type") args.type = argv[++i];
        else if (a === "--neighborhood") args.neighborhood = argv[++i];
        else if (a === "--dry-run") args.dryRun = true;
        else if (a === "--radius") args.radius = Number(argv[++i]);
        else if (a === "--max-details") args.maxDetails = Number(argv[++i]);
        else if (a === "--delay") args.delay = Number(argv[++i]);
        else if (a === "--no-text-search") args.textSearch = false;
        else if (a === "--help" || a === "-h") args.help = true;
    }
    if (Number.isNaN(args.radius)) args.radius = 450;
    if (Number.isNaN(args.maxDetails)) args.maxDetails = 500;
    if (Number.isNaN(args.delay)) args.delay = 150;
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

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function ensureNeighborhoodNote(slug, label) {
    const file = path.join(VAULT, "neighborhoods", `${slug}.md`);
    if (fs.existsSync(file)) return false;
    ensureDir(path.dirname(file));
    fs.writeFileSync(
        file,
        `---\nrole: neighborhood\nname: ${label}\n---\n\n# ${label}\n\n> Backlinks list every place note linked to [[${label}]].\n`,
        "utf8"
    );
    return true;
}

function ensureTypeNote(type) {
    const file = path.join(VAULT, "types", `${type}.md`);
    if (fs.existsSync(file)) return false;
    ensureDir(path.dirname(file));
    const display = TYPE_DISPLAY[type];
    fs.writeFileSync(
        file,
        `---\nrole: type\nname: ${display}\n---\n\n# ${display}\n\n> Backlinks list every place note linked to [[${display}]].\n`,
        "utf8"
    );
    return true;
}

function ensureSmokingNote() {
    const file = path.join(VAULT, "attributes", "unknown.md");
    if (fs.existsSync(file)) return false;
    ensureDir(path.dirname(file));
    fs.writeFileSync(
        file,
        `---\nrole: attribute\nname: Unknown\nkind: smoking\nvalue: unknown\n---\n\n# Unknown\n\n> Backlinks list places with this smoking status.\n`,
        "utf8"
    );
    return true;
}

function ensureDayNotes() {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "closed"];
    let n = 0;
    for (const d of days) {
        const title = d === "closed" ? "Closed" : d[0].toUpperCase() + d.slice(1);
        const file = path.join(VAULT, "days", `${d}.md`);
        if (fs.existsSync(file)) continue;
        ensureDir(path.dirname(file));
        fs.writeFileSync(
            file,
            `---\nrole: day\nname: ${title}\n---\n\n# ${title}\n\n> Backlinks list places linked to [[${title}]].\n`,
            "utf8"
        );
        n++;
    }
    return n;
}

function ensurePriceNote(priceRange) {
    if (!priceRange) return false;
    const file = path.join(VAULT, "attributes", "price", `${priceRange}.md`);
    if (fs.existsSync(file)) return false;
    ensureDir(path.dirname(file));
    fs.writeFileSync(
        file,
        `---\nrole: price\nname: "${priceRange}"\n---\n\n# ${priceRange}\n\n> Backlinks list places at this price range.\n`,
        "utf8"
    );
    return true;
}

function isAddressOnly(types) {
    if (!Array.isArray(types) || !types.length) return true;
    return types.every(
        (t) => ADDRESS_ONLY.has(t) || t === "establishment" || t === "point_of_interest"
    );
}

function keepType(placeType, types) {
    const allow = KEEP_TYPES[placeType];
    if (!allow) return false;
    if (!Array.isArray(types) || !types.length) return false;
    return types.some((t) => allow.has(t));
}

function inBbox(lat, lng, bbox) {
    const [s, w, n, e] = bbox;
    return lat >= s && lat <= n && lng >= w && lng <= e;
}

function gridPoints(bbox, radius) {
    const [s, w, n, e] = bbox;
    // Approx meters per degree at Berlin latitude
    const mPerDegLat = 111320;
    const mPerDegLng = 111320 * Math.cos((52.47 * Math.PI) / 180);
    // Overlap cells so radius circles cover edges
    const stepLat = (radius * 0.85) / mPerDegLat;
    const stepLng = (radius * 0.85) / mPerDegLng;
    const points = [];
    for (let lat = s + stepLat / 2; lat < n; lat += stepLat) {
        for (let lng = w + stepLng / 2; lng < e; lng += stepLng) {
            points.push({ lat, lng });
        }
    }
    return points;
}

function loadExistingPlaceIds() {
    const ids = new Set();
    const placesRoot = path.join(VAULT, "places");
    if (!fs.existsSync(placesRoot)) return ids;

    function walk(dir) {
        for (const entry of fs.readdirSync(dir)) {
            if (entry.startsWith("_") || entry.startsWith(".")) continue;
            const full = path.join(dir, entry);
            let st;
            try { st = fs.statSync(full); } catch { continue; }
            if (st.isDirectory()) walk(full);
            else if (entry.endsWith(".md")) {
                try {
                    const d = matter(fs.readFileSync(full, "utf8")).data;
                    if (d.google_place_id) ids.add(String(d.google_place_id));
                } catch { /* ignore */ }
            }
        }
    }
    walk(placesRoot);
    return ids;
}

function loadNeighborhoodIndex(dir) {
    const byId = new Map();
    const bySlug = new Map();
    if (!fs.existsSync(dir)) return { byId, bySlug };
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".md")) continue;
        const full = path.join(dir, f);
        try {
            const d = matter(fs.readFileSync(full, "utf8")).data;
            if (d.google_place_id) byId.set(String(d.google_place_id), full);
            bySlug.set(f.replace(/\.md$/, ""), full);
        } catch {
            /* ignore */
        }
    }
    return { byId, bySlug };
}

async function discoverCandidates(args, bbox, stats, area) {
    const found = new Map();
    const keep = KEEP_TYPES[args.type];
    const nearbyType = NEARBY_TYPE[args.type] || args.type;

    const addResults = (results) => {
        for (const p of results || []) {
            if (!p.place_id) continue;
            if (!found.has(p.place_id)) {
                found.set(p.place_id, p);
                stats.discovered++;
            }
        }
    };

    const points = gridPoints(bbox, args.radius);
    console.log(`Grid: ${points.length} cells @ radius ${args.radius}m (type=${nearbyType})`);

    for (let i = 0; i < points.length; i++) {
        const { lat, lng } = points[i];
        try {
            let page = 0;
            let pageToken = null;
            do {
                const res = await placesNearby(lat, lng, args.radius, {
                    type: nearbyType,
                    pageToken,
                });
                addResults(res.results);
                stats.searchCalls++;
                pageToken = res.next_page_token || null;
                page++;
                if (pageToken) {
                    // Google requires a few seconds before next_page_token is valid
                    await sleep(2000);
                }
            } while (pageToken && page < 3);
        } catch (e) {
            stats.errors++;
            console.warn(`  nearby cell ${i + 1} failed: ${e.message}`);
        }
        if ((i + 1) % 5 === 0 || i === points.length - 1) {
            console.log(`  nearby ${i + 1}/${points.length} — unique so far: ${found.size}`);
        }
        await sleep(args.delay);
    }

    if (args.textSearch) {
        const place = area.label;
        const queries = [
            `bar in ${place}, Berlin`,
            `bars in ${place} Berlin`,
            `Kneipe ${place} Berlin`,
            `Pub ${place} Berlin`,
            `Cocktailbar ${place} Berlin`,
            `Biergarten ${place} Berlin`,
            `Gasthaus ${place} Berlin`,
        ];
        for (const q of queries) {
            try {
                const res = await placesTextSearch(q);
                addResults(res.results);
                stats.searchCalls++;
                // page 2–3
                if (res.next_page_token) {
                    await sleep(200);
                    // Text search paging requires re-query with pagetoken — not in helper;
                    // skip secondary pages for text (grid covers density).
                }
            } catch (e) {
                stats.errors++;
                console.warn(`  text "${q}" failed: ${e.message}`);
            }
            await sleep(args.delay);
        }
        console.log(`After text search: unique=${found.size}`);
    }

    // Pre-filter: bbox + candidate bar types from summary results
    const candidates = [];
    for (const p of found.values()) {
        const lat = p.geometry?.location?.lat;
        const lng = p.geometry?.location?.lng;
        if (lat == null || lng == null) continue;
        if (!inBbox(lat, lng, bbox)) {
            stats.outOfBbox++;
            continue;
        }
        const types = p.types || [];
        if (isAddressOnly(types)) {
            stats.skippedStub++;
            continue;
        }
        if (!keepType(args.type, types)) {
            // Nearby type=bar usually guarantees bar-ish, but text search may not
            if (!types.some((t) => keep.has(t))) {
                stats.skippedType++;
                continue;
            }
        }
        candidates.push(p);
    }
    stats.afterPreFilter = candidates.length;
    return candidates;
}

function hoursFromDetails(openingHours) {
    if (!openingHours) {
        const empty = {};
        for (const d of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) empty[d] = null;
        return { hours: empty, raw: null };
    }
    if (Array.isArray(openingHours.weekday_text) && openingHours.weekday_text.length) {
        return {
            hours: parseWeekdayText(openingHours.weekday_text),
            raw: openingHours.weekday_text.join("; "),
        };
    }
    if (Array.isArray(openingHours.periods) && openingHours.periods.length) {
        const hours = periodsToHours(openingHours.periods);
        const parts = Object.entries(hours)
            .filter(([, v]) => v)
            .map(([d, v]) => `${d}:${v}`);
        return { hours, raw: parts.length ? parts.join(", ") : null };
    }
    const empty = {};
    for (const d of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) empty[d] = null;
    return { hours: empty, raw: null };
}

function buildPlaceMarkdown(data, area) {
    const typeDisplay = TYPE_DISPLAY[data.type];
    const hoodDisplay = area.label;
    const smokingDisplay = "Unknown";
    const priceRange = data.price_range;

    const links = [`[[${typeDisplay}]]`, `[[${hoodDisplay}]]`, `[[${smokingDisplay}]]`];
    if (priceRange) links.push(`[[${priceRange}]]`);

    const rows = hoursToRows(data.hours || {});
    const hoursTable = rows
        .map((r) => {
            if (!r.value) return `| [[${r.name}]] |  |  |`;
            if (r.value === "closed") return `| [[${r.name}]] | [[Closed]] |  |`;
            const first = r.value.split(",")[0].trim();
            const m = first.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
            if (m) return `| [[${r.name}]] | ${m[1]} | ${m[2]} |`;
            return `| [[${r.name}]] | ${r.value} |  |`;
        })
        .join("\n");

    const contact = [];
    if (data.website) contact.push(`- Website: ${data.website}`);
    if (data.phone) contact.push(`- Phone: ${data.phone}`);
    if (!contact.length) contact.push("-");

    const body = [
        `## Links`,
        links.join(" · "),
        ``,
        `## Address`,
        data.address || "",
        ``,
        `## Hours`,
        `| Day | Open | Close |`,
        `|-----|------|-------|`,
        hoursTable,
        ``,
        `## Contact`,
        ...contact,
        ``,
        `## Notes`,
        ``,
    ].join("\n");

    return matter.stringify(body, data, { quotingType: '"', forceQuotes: false });
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        console.log(`Usage: node scripts/vault/harvest_google.js --type bar --neighborhood neukoelln
  --dry-run         discover only, no writes
  --radius N        nearby radius meters (default 450)
  --max-details N   cap Details calls (default 500)
  --delay MS        pause between calls (default 150)
  --no-text-search  skip text search queries`);
        process.exit(0);
    }

    const area = areas[args.neighborhood];
    if (!area) {
        console.error(`Unknown neighborhood "${args.neighborhood}". Known:`, Object.keys(areas).join(", "));
        process.exit(1);
    }
    if (!TYPE_DISPLAY[args.type]) {
        console.error(`Unknown type "${args.type}". Use bar | cafe | restaurant`);
        process.exit(1);
    }

    const stats = {
        discovered: 0,
        outOfBbox: 0,
        skippedStub: 0,
        skippedType: 0,
        afterPreFilter: 0,
        skippedDup: 0,
        detailsFetched: 0,
        rejectedAfterDetails: 0,
        created: 0,
        updated: 0,
        skippedExisting: 0,
        searchCalls: 0,
        errors: 0,
    };

    console.log(`Harvesting ${args.type} from Google Maps in ${area.label}…`);
    console.log(`bbox: [${area.bbox.join(", ")}]`);

    const existingIds = loadExistingPlaceIds();
    console.log(`Existing google_place_ids in vault: ${existingIds.size}`);

    const candidates = await discoverCandidates(args, area.bbox, stats, area);
    console.log(`Candidates after pre-filter: ${candidates.length}`);

    // Dedup against whole vault
    const queue = [];
    for (const p of candidates) {
        if (existingIds.has(String(p.place_id))) {
            stats.skippedDup++;
            continue;
        }
        queue.push(p);
    }
    console.log(`After vault dedup: ${queue.length} (skipped ${stats.skippedDup} dups)`);

    const placesDir = path.join(VAULT, "places", args.type, area.slug);
    const index = loadNeighborhoodIndex(placesDir);
    const usedSlugs = new Set(index.bySlug.keys());

    if (args.dryRun) {
        console.log(`
[dry-run] Would fetch Details for up to ${Math.min(queue.length, args.maxDetails)} places
  discovered:       ${stats.discovered}
  out of bbox:      ${stats.outOfBbox}
  skipped stub:     ${stats.skippedStub}
  skipped type:     ${stats.skippedType}
  after pre-filter: ${stats.afterPreFilter}
  skipped dup:      ${stats.skippedDup}
  would detail:     ${Math.min(queue.length, args.maxDetails)}
  search calls:     ${stats.searchCalls}
  errors:           ${stats.errors}
`);
        return;
    }

    ensureNeighborhoodNote(area.slug, area.label);
    ensureTypeNote(args.type);
    ensureSmokingNote();
    ensureDayNotes();

    const detailQueue = queue.slice(0, args.maxDetails);
    if (queue.length > args.maxDetails) {
        console.log(`Capping Details at --max-details ${args.maxDetails} (${queue.length} queued)`);
    }

    for (let i = 0; i < detailQueue.length; i++) {
        const summary = detailQueue[i];
        try {
            const det = await placesDetails(summary.place_id);
            const g = det.result || {};
            stats.detailsFetched++;

            const types = Array.isArray(g.types) ? g.types : summary.types || [];
            if (isAddressOnly(types) || !keepType(args.type, types)) {
                stats.rejectedAfterDetails++;
                await sleep(args.delay);
                continue;
            }

            let primaryType = null;
            let primaryTypeDisplay = null;
            try {
                const n = await placesDetailsNew(summary.place_id);
                primaryType = n.primaryType || null;
                primaryTypeDisplay = n.primaryTypeDisplayName?.text || null;
                if (Array.isArray(n.types) && n.types.length) {
                    types.length = 0;
                    types.push(...n.types);
                }
            } catch { /* legacy types only */ }

            const lat = g.geometry?.location?.lat ?? summary.geometry?.location?.lat;
            const lng = g.geometry?.location?.lng ?? summary.geometry?.location?.lng;
            if (lat == null || lng == null || !inBbox(lat, lng, area.bbox)) {
                stats.rejectedAfterDetails++;
                await sleep(args.delay);
                continue;
            }

            const name = String(g.name || summary.name || "").trim();
            if (!name) {
                stats.rejectedAfterDetails++;
                await sleep(args.delay);
                continue;
            }

            let slug = slugify(name);
            if (!slug) slug = `place_${summary.place_id.slice(-8)}`;
            const existingPath = index.byId.get(String(summary.place_id));
            let filePath = existingPath;
            const noteDir = args.type === "bar"
                ? path.join(VAULT, "places", "bar", primaryType || "bar", area.slug)
                : path.join(VAULT, "places", args.type, area.slug);
            if (!filePath) {
                if (usedSlugs.has(slug)) {
                    let n = 2;
                    while (usedSlugs.has(`${slug}_${n}`)) n++;
                    slug = `${slug}_${n}`;
                }
                usedSlugs.add(slug);
                filePath = path.join(noteDir, `${slug}.md`);
            }

            const { hours, raw } = hoursFromDetails(g.opening_hours);
            const price_range = googlePriceToRange(g.price_level);
            if (price_range) ensurePriceNote(price_range);

            const phone = g.international_phone_number || g.formatted_phone_number || null;
            const data = {
                name,
                slug: path.basename(filePath, ".md"),
                type: args.type,
                neighborhood: area.slug,
                address: g.formatted_address || null,
                coordinates: { lat: Number(lat), lng: Number(lng) },
                smoking: "unknown",
                price_range,
                cuisine: [],
                tags: [],
                website: g.website || null,
                phone,
                opening_hours_raw: raw,
                hours,
                source: "google",
                source_id: `place/${summary.place_id}`,
                created: new Date().toISOString().slice(0, 10),
                google_place_id: summary.place_id,
                google_name: g.name || name,
                google_verified: true,
                google_types: types,
            };
            if (primaryType) data.google_primary_type = primaryType;
            if (primaryTypeDisplay) data.google_primary_type_display = primaryTypeDisplay;
            if (g.rating != null) data.google_rating = g.rating;
            if (g.user_ratings_total != null) data.google_user_ratings_total = g.user_ratings_total;

            const markdown = buildPlaceMarkdown(data, area);

            if (fs.existsSync(filePath)) {
                const existing = matter(fs.readFileSync(filePath, "utf8"));
                if (JSON.stringify(existing.data) === JSON.stringify(data)) {
                    stats.skippedExisting++;
                } else {
                    // preserve ## Notes if any
                    const notesMatch = existing.content.match(/\n## Notes\n([\s\S]*)$/);
                    const notesPart = notesMatch ? `## Notes\n${notesMatch[1]}` : `## Notes\n`;
                    const rebuilt = matter.stringify(
                        markdown.replace(/\n## Notes\n[\s\S]*$/, "\n") + notesPart.replace(/^\n?/, "\n"),
                        data
                    );
                    fs.writeFileSync(filePath, rebuilt, "utf8");
                    stats.updated++;
                }
            } else {
                ensureDir(noteDir);
                fs.writeFileSync(filePath, markdown, "utf8");
                index.byId.set(String(summary.place_id), filePath);
                stats.created++;
            }

            if ((i + 1) % 20 === 0 || i === detailQueue.length - 1) {
                console.log(`  details ${i + 1}/${detailQueue.length} — created=${stats.created} updated=${stats.updated}`);
            }
            await sleep(args.delay);
        } catch (e) {
            stats.errors++;
            console.error(`  details fail ${summary.name || summary.place_id}: ${e.message}`);
            await sleep(500);
        }
    }

    const reportPath = path.join(VAULT, "places", `harvest-google-${area.slug}-report.json`);
    const report = {
        updated: new Date().toISOString(),
        type: args.type,
        neighborhood: area.slug,
        ...stats,
        folder: placesDir,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    console.log(`
Done.
  discovered:       ${stats.discovered}
  out of bbox:      ${stats.outOfBbox}
  skipped stub:     ${stats.skippedStub}
  skipped type:     ${stats.skippedType}
  skipped dup:      ${stats.skippedDup}
  details fetched:  ${stats.detailsFetched}
  rejected details: ${stats.rejectedAfterDetails}
  created:          ${stats.created}
  updated:          ${stats.updated}
  unchanged:        ${stats.skippedExisting}
  search calls:     ${stats.searchCalls}
  errors:           ${stats.errors}
  folder:           ${placesDir}
  report:           ${reportPath}
`);
}

main().catch((err) => {
    console.error("Harvest failed:", err);
    process.exit(1);
});
