#!/usr/bin/env node
/**
 * Harvest every Döner / Kebab restaurant from Google Maps across Berlin.
 *
 * Discovery:
 *   - Paged Text Search (many query variants, city + per-Bezirk)
 *   - Optional Nearby restaurant grid, name/type filtered to doner/kebab
 * Write:
 *   - places/restaurant/{hood}/*.md  (type=restaurant, cuisine/tags include Döner)
 *
 * Usage:
 *   node scripts/vault/harvest_doner.js
 *   node scripts/vault/harvest_doner.js --dry-run
 *   node scripts/vault/harvest_doner.js --delay 200 --max-details 500
 *   node scripts/vault/harvest_doner.js --no-grid
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env.local") });

const {
    placesTextSearchPaged,
    placesNearby,
    placesDetails,
    placesDetailsNew,
    parseWeekdayText,
    periodsToHours,
    googlePriceToRange,
    reverseGeocode,
} = require("./google");
const { hoursToRows } = require("./hours");
const areas = require("./areas.json");

const VAULT = process.env.OBSIDIAN_VAULT_PATH;
if (!VAULT || !fs.existsSync(VAULT)) {
    console.error("OBSIDIAN_VAULT_PATH missing or not found:", VAULT);
    process.exit(1);
}

const DONER_NAME_RE = /d[oö]ner|doner|kebab|kebap|kebapci|kebabci|kebabc[iı]|kebabimbiss|k[eä]bab\s*[-\s]?imbiss|imbiss\s*[-\s]?k[eä]bab/i;
const IMBISS_NAME_RE = /k[eä]babimbiss|k[eä]bab\s*[-\s]?imbiss|imbiss\s*[-\s]?k[eä]bab|d[oö]ner\s*[-\s]?imbiss|imbiss\s*[-\s]?d[oö]ner/i;
const DONER_TYPE_HINTS = new Set([
    "kebab_shop",
    "döner_restaurant",
    "doner_restaurant",
    "turkish_restaurant",
    "fast_food_restaurant",
    "meal_takeaway",
]);

const ADDRESS_ONLY = new Set([
    "street_address", "premise", "premise", "route", "intersection",
    "postal_code", "neighborhood", "locality", "political", "country",
    "geocode", "plus_code",
]);

function parseArgs(argv) {
    const args = {
        dryRun: false,
        delay: 180,
        maxDetails: 800,
        maxPages: 3,
        // Full-Berlin nearby grid at 500m ≈ 10k cells — too expensive; text search covers queries.
        // Pass --grid to enable (or --radius 1500 for a coarser sweep).
        grid: false,
        radius: 1200,
        // Only run Kebabimbiss / Imbiss discovery queries
        onlyImbiss: false,
        help: false,
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--dry-run") args.dryRun = true;
        else if (a === "--delay") args.delay = Number(argv[++i]);
        else if (a === "--max-details") args.maxDetails = Number(argv[++i]);
        else if (a === "--max-pages") args.maxPages = Number(argv[++i]);
        else if (a === "--radius") args.radius = Number(argv[++i]);
        else if (a === "--no-grid") args.grid = false;
        else if (a === "--only-imbiss") args.onlyImbiss = true;
        else if (a === "--help" || a === "-h") args.help = true;
    }
    if (Number.isNaN(args.delay)) args.delay = 180;
    if (Number.isNaN(args.maxDetails)) args.maxDetails = 800;
    if (Number.isNaN(args.maxPages)) args.maxPages = 3;
    if (Number.isNaN(args.radius)) args.radius = 500;
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

function isAddressOnly(types) {
    if (!Array.isArray(types) || !types.length) return true;
    return types.every(
        (t) => ADDRESS_ONLY.has(t) || t === "establishment" || t === "point_of_interest"
    );
}

function looksLikeDoner({ name, types, primaryType }) {
    if (name && DONER_NAME_RE.test(String(name))) return true;
    if (name && IMBISS_NAME_RE.test(String(name))) return true;
    const pt = String(primaryType || "").toLowerCase();
    if (pt && (pt.includes("kebab") || pt.includes("doner") || pt.includes("döner"))) return true;
    if (Array.isArray(types) && types.some((t) => DONER_TYPE_HINTS.has(t) && /kebab|doner|döner/.test(t))) {
        return true;
    }
    // kebab_shop alone is enough even without name match
    if (Array.isArray(types) && types.includes("kebab_shop")) return true;
    if (pt === "kebab_shop") return true;
    return false;
}

function inBbox(lat, lng, bbox) {
    const [s, w, n, e] = bbox;
    return lat >= s && lat <= n && lng >= w && lng <= e;
}

function gridPoints(bbox, radius) {
    const [s, w, n, e] = bbox;
    const mPerDegLat = 111320;
    const mPerDegLng = 111320 * Math.cos((52.47 * Math.PI) / 180);
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

function loadSlugIndex(typeDir) {
    const byId = new Map();
    const bySlug = new Set();
    const dir = path.join(VAULT, "places", typeDir);
    if (!fs.existsSync(dir)) return { byId, bySlug };
    function walk(d) {
        for (const entry of fs.readdirSync(d)) {
            if (entry.startsWith("_") || entry.startsWith(".")) continue;
            const full = path.join(d, entry);
            let st;
            try { st = fs.statSync(full); } catch { continue; }
            if (st.isDirectory()) walk(full);
            else if (entry.endsWith(".md")) {
                bySlug.add(entry.replace(/\.md$/, ""));
                try {
                    const data = matter(fs.readFileSync(full, "utf8")).data;
                    if (data.google_place_id) byId.set(String(data.google_place_id), full);
                } catch { /* ignore */ }
            }
        }
    }
    walk(dir);
    return { byId, bySlug };
}

function ensureNeighborhoodNote(slug, label) {
    const file = path.join(VAULT, "neighborhoods", `${slug}.md`);
    if (fs.existsSync(file)) return;
    ensureDir(path.dirname(file));
    fs.writeFileSync(
        file,
        `---\nrole: neighborhood\nname: ${label}\n---\n\n# ${label}\n\n> Backlinks list every place note linked to [[${label}]].\n`,
        "utf8"
    );
}

function ensureTypeNote() {
    const file = path.join(VAULT, "types", "restaurant.md");
    if (fs.existsSync(file)) return;
    ensureDir(path.dirname(file));
    fs.writeFileSync(
        file,
        `---\nrole: type\nname: Restaurant\n---\n\n# Restaurant\n\n> Backlinks list every place note linked to [[Restaurant]].\n`,
        "utf8"
    );
}

function ensureDayNotes() {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "closed"];
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
    }
}

function ensurePriceNote(priceRange) {
    if (!priceRange) return false;
    const file = path.join(VAULT, "attributes", "price", `${priceRange}.md`);
    if (fs.existsSync(file)) return false;
    ensureDir(path.dirname(file));
    fs.writeFileSync(
        file,
        `---\nrole: attribute\nname: "${priceRange}"\nkind: price\nvalue: "${priceRange}"\n---\n\n# ${priceRange}\n\n> Backlinks list places at this price range.\n`,
        "utf8"
    );
    return true;
}

const CUISINE_LINK_OVERRIDES = {
    türkisch: { slug: "turkish", title: "Turkish" },
    turkish: { slug: "turkish", title: "Turkish" },
    döner: { slug: "doner", title: "Döner" },
    doner: { slug: "doner", title: "Döner" },
    kebab: { slug: "kebab", title: "Kebab" },
    kebap: { slug: "kebab", title: "Kebab" },
};

function ensureCuisineNote(raw) {
    const mapped = CUISINE_LINK_OVERRIDES[String(raw).toLowerCase()];
    const slug = mapped ? mapped.slug : slugify(raw);
    if (!slug) return false;
    const title = mapped
        ? mapped.title
        : String(raw)
            .split(/[;_]/)
            .filter(Boolean)
            .map((w) => w[0].toUpperCase() + w.slice(1))
            .join(" ");
    const file = path.join(VAULT, "attributes", "cuisine", `${slug}.md`);
    if (fs.existsSync(file)) return false;
    ensureDir(path.dirname(file));
    fs.writeFileSync(
        file,
        `---\nrole: attribute\nname: ${title}\nkind: cuisine\nvalue: ${slug}\n---\n\n# ${title}\n\n> Backlinks list places tagged with this cuisine.\n`,
        "utf8"
    );
    return true;
}

function cuisineWikiLinks(cuisineList) {
    const links = [];
    for (const raw of cuisineList || []) {
        const mapped = CUISINE_LINK_OVERRIDES[String(raw).toLowerCase()];
        const slug = mapped ? mapped.slug : slugify(raw);
        if (!slug) continue;
        ensureCuisineNote(raw);
        const title = mapped
            ? mapped.title
            : String(raw)
                .split(/[;_]/)
                .filter(Boolean)
                .map((w) => w[0].toUpperCase() + w.slice(1))
                .join(" ");
        const wiki = `[[${slug}|${title}]]`;
        if (!links.includes(wiki)) links.push(wiki);
    }
    return links;
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
    return { hours, raw: null };
}

async function hoodFromCoords(lat, lng) {
    // Prefer reverse geocode → match area slug by bbox (more reliable than labels)
    try {
        const results = await reverseGeocode(lat, lng);
        const text = results.map((r) => r.formatted_address || "").join(" ").toLowerCase();
        for (const area of Object.values(areas)) {
            // match zip/ortsteil tokens in reverse geocode address components
            const label = area.label.toLowerCase();
            if (text.includes(label) || text.includes(area.slug.replace(/-/g, " "))) {
                return area.slug;
            }
        }
        // fallback: which bbox contains the point
        for (const area of Object.values(areas)) {
            if (inBbox(lat, lng, area.bbox)) return area.slug;
        }
    } catch { /* fall through */ }
    for (const area of Object.values(areas)) {
        if (inBbox(lat, lng, area.bbox)) return area.slug;
    }
    return "mitte";
}

function queriesForArea(area, { onlyImbiss = false } = {}) {
    const label = area ? area.label : "Berlin";
    if (onlyImbiss) {
        const imbiss = [
            `Kebabimbiss ${label} Berlin`,
            `Kebab Imbiss ${label} Berlin`,
            `Kebab-Imbiss ${label} Berlin`,
            `Döner Imbiss ${label} Berlin`,
            `Dönerimbiss ${label} Berlin`,
            `Imbiss ${label} Berlin Kebab`,
        ];
        if (!area) {
            imbiss.push(
                "Kebabimbiss Berlin",
                "Kebab Imbiss Berlin",
                "Kebab-Imbiss Berlin",
                "Dönerimbiss Berlin",
                "Döner Imbiss Berlin",
                "Türkisches Imbiss Berlin Kebab",
                "Imbiss Berlin Kebab"
            );
        }
        return imbiss;
    }
    const base = [
        `Döner-Restaurant ${label} Berlin`,
        `Döner Restaurant ${label} Berlin`,
        `Döner ${label} Berlin`,
        `Döner Imbiss ${label} Berlin`,
        `Dönerbude ${label} Berlin`,
        `Kebab ${label} Berlin`,
        `Kebap ${label} Berlin`,
        `Kebabimbiss ${label} Berlin`,
        `Kebab Imbiss ${label} Berlin`,
        `Gemüse Kebab ${label} Berlin`,
        `Döner-Kebab ${label}`,
        `Türkisches Restaurant ${label} Berlin`,
        `Imbiss ${label} Berlin Döner`,
        `Imbiss ${label} Berlin Kebab`,
        `beste Döner ${label} Berlin`,
    ];
    if (!area) {
        base.push(
            "Döner-Restaurant Berlin",
            "Döner Berlin",
            "Kebab Berlin",
            "Kebap Berlin",
            "Kebabimbiss Berlin",
            "Kebab Imbiss Berlin",
            "Döner Imbiss Berlin",
            "Dönerimbiss Berlin",
            "beste Döner Berlin",
            "Gemüse Kebab Berlin",
            "Döner-Restaurant in Berlin",
            "Kebab Shop Berlin",
            "Türkisches Imbiss Berlin"
        );
    }
    return base;
}

async function discover(args, stats) {
    const found = new Map();
    const add = (p) => {
        if (!p || !p.place_id) return;
        if (!found.has(p.place_id)) {
            found.set(p.place_id, p);
            stats.discovered++;
        }
    };

    // 1) City-wide + per-Bezirk paged text search
    const jobs = [
        { area: null, qs: queriesForArea(null, args) },
        ...Object.values(areas).map((area) => ({ area, qs: queriesForArea(area, args) })),
    ];

    for (const job of jobs) {
        for (const q of job.qs) {
            try {
                const { results, pages } = await placesTextSearchPaged(q, {
                    maxPages: args.maxPages,
                    delayMs: 250,
                });
                results.forEach(add);
                stats.searchCalls++;
                stats.textPages += pages;
                if (results.length) {
                    console.log(`  text [${job.area ? job.area.slug : "berlin"}] "${q}" → ${results.length} (${pages}p) total=${found.size}`);
                }
            } catch (e) {
                stats.errors++;
                console.warn(`  text fail "${q}": ${e.message}`);
            }
            await sleep(args.delay);
        }
    }

    // 2) Nearby restaurant grid (Berlin-wide coarse), name/type filtered later
    if (args.grid) {
        const berlinBbox = [52.34, 13.08, 52.68, 13.77];
        const points = gridPoints(berlinBbox, args.radius);
        console.log(`Nearby grid: ${points.length} cells @ ${args.radius}m (type=restaurant)`);
        for (let i = 0; i < points.length; i++) {
            const { lat, lng } = points[i];
            try {
                let pageToken = null;
                let page = 0;
                do {
                    const res = await placesNearby(lat, lng, args.radius, {
                        type: "restaurant",
                        pageToken,
                    });
                    (res.results || []).forEach(add);
                    stats.searchCalls++;
                    pageToken = res.next_page_token || null;
                    page++;
                    if (pageToken) await sleep(2000);
                } while (pageToken && page < 3);
            } catch (e) {
                stats.errors++;
                if ((i + 1) % 10 === 0) console.warn(`  nearby cell ${i + 1} fail: ${e.message}`);
            }
            if ((i + 1) % 15 === 0 || i === points.length - 1) {
                console.log(`  nearby ${i + 1}/${points.length} — unique=${found.size}`);
            }
            await sleep(args.delay);
        }
    }

    // 3) Prefilter: name/type looks like döner-kebab (before bbox — text may be city-wide)
    const candidates = [];
    for (const p of found.values()) {
        const name = p.name || "";
        const types = p.types || [];
        if (isAddressOnly(types)) {
            stats.skippedStub++;
            continue;
        }
        if (!looksLikeDoner({ name, types, primaryType: null })) {
            stats.skippedNotDoner++;
            continue;
        }
        candidates.push(p);
    }
    stats.afterNameFilter = candidates.length;
    return candidates;
}

function buildPlaceMarkdown(data, hoodLabel) {
    const links = [`[[Restaurant]]`, `[[${hoodLabel}]]`, `[[Unknown]]`];
    if (data.price_range) links.push(`[[${data.price_range}]]`);
    for (const wiki of cuisineWikiLinks(data.cuisine)) links.push(wiki);

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
        console.log(`Usage: node scripts/vault/harvest_doner.js [--dry-run] [--delay ms] [--max-details n] [--no-grid] [--only-imbiss]`);
        process.exit(0);
    }

    const stats = {
        discovered: 0,
        skippedStub: 0,
        skippedNotDoner: 0,
        afterNameFilter: 0,
        skippedDup: 0,
        outsideBerlin: 0,
        rejectedAfterDetails: 0,
        detailsFetched: 0,
        created: 0,
        updated: 0,
        skippedExisting: 0,
        searchCalls: 0,
        textPages: 0,
        errors: 0,
    };

    console.log("Harvesting Döner-Restaurants from Google Maps (Berlin-wide)…");
    const existingIds = loadExistingPlaceIds();
    console.log(`Existing google_place_ids in vault: ${existingIds.size}`);

    const candidates = await discover(args, stats);
    console.log(`After döner/kebab name+type filter: ${candidates.length}`);

    const berlinBbox = [52.34, 13.08, 52.68, 13.77];
    const queue = [];
    for (const p of candidates) {
        if (existingIds.has(String(p.place_id))) {
            stats.skippedDup++;
            continue;
        }
        const lat = p.geometry?.location?.lat;
        const lng = p.geometry?.location?.lng;
        if (lat == null || lng == null || !inBbox(lat, lng, berlinBbox)) {
            stats.outsideBerlin++;
            continue;
        }
        queue.push(p);
    }
    console.log(`Queue after Berlin bbox + vault dedup: ${queue.length} (dups=${stats.skippedDup}, outside=${stats.outsideBerlin})`);

    const index = loadSlugIndex("restaurant");
    const usedSlugs = new Set(index.bySlug);

    if (args.dryRun) {
        console.log(`\n[dry-run] would detail ${Math.min(queue.length, args.maxDetails)}`);
        for (const p of queue.slice(0, 30)) console.log(`  - ${p.name}`);
        if (queue.length > 30) console.log(`  … +${queue.length - 30} more`);
        console.log(JSON.stringify(stats, null, 2));
        return;
    }

    ensureNeighborhoodNote("mitte", "Mitte");
    ensureTypeNote();
    ensureDayNotes();

    const detailQueue = queue.slice(0, args.maxDetails);
    if (queue.length > args.maxDetails) {
        console.log(`Capping details at ${args.maxDetails} (${queue.length} queued)`);
    }

    for (let i = 0; i < detailQueue.length; i++) {
        const summary = detailQueue[i];
        try {
            const det = await placesDetails(summary.place_id);
            const g = det.result || {};
            stats.detailsFetched++;

            const types = Array.isArray(g.types) ? g.types.slice() : summary.types || [];
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
            } catch { /* legacy only */ }

            const name = String(g.name || summary.name || "").trim();
            if (!looksLikeDoner({ name, types, primaryType })) {
                stats.rejectedAfterDetails++;
                await sleep(args.delay);
                continue;
            }

            const lat = g.geometry?.location?.lat ?? summary.geometry?.location?.lat;
            const lng = g.geometry?.location?.lng ?? summary.geometry?.location?.lng;
            if (lat == null || lng == null || !inBbox(lat, lng, berlinBbox)) {
                stats.rejectedAfterDetails++;
                await sleep(args.delay);
                continue;
            }

            const hood = await hoodFromCoords(lat, lng);
            const area = areas[hood] || areas.mitte;
            ensureNeighborhoodNote(area.slug, area.label);

            let slug = slugify(name) || `doner_${summary.place_id.slice(-8)}`;
            let filePath = index.byId.get(String(summary.place_id));
            const noteDir = path.join(VAULT, "places", "restaurant", area.slug);
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
            const tags = ["Döner", "Kebab"];
            if (IMBISS_NAME_RE.test(name) || /imbiss/i.test(name)) tags.push("Kebabimbiss");
            if (primaryType && !tags.includes(primaryType)) tags.push(primaryType);

            const data = {
                name,
                slug: path.basename(filePath, ".md"),
                type: "restaurant",
                neighborhood: area.slug,
                address: g.formatted_address || null,
                coordinates: { lat: Number(lat), lng: Number(lng) },
                smoking: "unknown",
                price_range,
                cuisine: ["Türkisch", "Döner"],
                tags,
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

            const markdown = buildPlaceMarkdown(data, area.label);

            if (fs.existsSync(filePath)) {
                const existing = matter(fs.readFileSync(filePath, "utf8"));
                // merge tags/cuisine if already present
                const merged = { ...existing.data, ...data };
                merged.tags = [...new Set([...(existing.data.tags || []), ...(data.tags || [])])];
                merged.cuisine = [...new Set([...(existing.data.cuisine || []), ...(data.cuisine || [])])];
                const notesMatch = existing.content.match(/\n## Notes\n([\s\S]*)$/);
                const notesPart = notesMatch ? `## Notes\n${notesMatch[1]}` : `## Notes\n`;
                const rebuilt = matter.stringify(
                    markdown.replace(/\n## Notes\n[\s\S]*$/, "\n") + notesPart.replace(/^\n?/, "\n"),
                    merged
                );
                if (JSON.stringify(existing.data) === JSON.stringify(merged) && existing.content === rebuilt.split(/^---$/m).slice(2).join("---")) {
                    stats.skippedExisting++;
                } else {
                    fs.writeFileSync(filePath, rebuilt, "utf8");
                    stats.updated++;
                }
            } else {
                ensureDir(noteDir);
                fs.writeFileSync(filePath, markdown, "utf8");
                index.byId.set(String(summary.place_id), filePath);
                stats.created++;
            }

            if ((i + 1) % 25 === 0 || i === detailQueue.length - 1) {
                console.log(`  details ${i + 1}/${detailQueue.length} — created=${stats.created} updated=${stats.updated}`);
            }
            await sleep(args.delay);
        } catch (e) {
            stats.errors++;
            console.error(`  details fail ${summary.name || summary.place_id}: ${e.message}`);
            await sleep(500);
        }
    }

    const reportPath = path.join(VAULT, "places", "harvest-doner-berlin-report.json");
    const report = {
        updated: new Date().toISOString(),
        query: "Döner-Restaurant",
        ...stats,
        queued: queue.length,
        detailed: detailQueue.length,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    console.log(`
Done.
  discovered:        ${stats.discovered}
  not doner/kebab:   ${stats.skippedNotDoner}
  after name filter: ${stats.afterNameFilter}
  skipped dup:       ${stats.skippedDup}
  outside Berlin:    ${stats.outsideBerlin}
  details fetched:   ${stats.detailsFetched}
  rejected details:  ${stats.rejectedAfterDetails}
  created:           ${stats.created}
  updated:           ${stats.updated}
  unchanged:         ${stats.skippedExisting}
  text pages:        ${stats.textPages}
  search calls:      ${stats.searchCalls}
  errors:            ${stats.errors}
  report:            ${reportPath}
`);
}

main().catch((err) => {
    console.error("Döner harvest failed:", err);
    process.exit(1);
});
