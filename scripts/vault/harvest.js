#!/usr/bin/env node
/**
 * Harvest venues from OpenStreetMap (Overpass) into the Obsidian vault
 * as linked markdown notes (folder-per-role knowledge graph).
 *
 * Usage:
 *   npm run vault:harvest -- --type bar --neighborhood kreuzberg
 *   npm run vault:harvest -- --type bar --neighborhood kreuzberg --force
 *
 * Types: bar | cafe | restaurant
 *   bar includes amenity bar, pub, biergarten (and optional club — not included).
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env.local") });

const { parseOpeningHours, collectHourTokens, hoursToRows, DAY_NAME } = require("./hours");
const { enrichPlaces } = require("./google");
const areas = require("./areas.json");

const VAULT = process.env.OBSIDIAN_VAULT_PATH;
if (!VAULT || !fs.existsSync(VAULT)) {
    console.error("OBSIDIAN_VAULT_PATH missing or not found:", VAULT);
    process.exit(1);
}

// private.coffee verified working; rotate others as fallbacks
const OVERPASS_ENDPOINTS = [
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const AMENITY_MAP = {
    bar: ["bar", "pub", "biergarten"],
    cafe: ["cafe"],
    restaurant: ["restaurant"],
};

const TYPE_DISPLAY = { bar: "Bar", cafe: "Cafe", restaurant: "Restaurant" };

const SMOKING_MAP = {
    no: "non-smoking",
    nonsmoking: "non-smoking",
    "non-smoking": "non-smoking",
    yes: "smoking",
    smoking: "smoking",
    designated: "mixed",
    mixed: "mixed",
    outdoor: "outdoor",
};

function parseArgs(argv) {
    const args = {
        type: "bar",
        neighborhood: "kreuzberg",
        force: false,
        dryRun: false,
        enrich: null,
        googleMax: 100,
        gapOnly: false,
        revalidate: false,
        skipGoogle: false,
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--type") args.type = argv[++i];
        else if (a === "--neighborhood") args.neighborhood = argv[++i];
        else if (a === "--force") args.force = true;
        else if (a === "--dry-run") args.dryRun = true;
        else if (a === "--enrich") args.enrich = argv[++i];
        else if (a === "--google-max") args.googleMax = Number(argv[++i]);
        else if (a === "--gap-only") args.gapOnly = true;
        else if (a === "--revalidate") args.revalidate = true;
        else if (a === "--no-google") args.skipGoogle = true;
        else if (a === "--help" || a === "-h") args.help = true;
    }
    if (Number.isNaN(args.googleMax)) args.googleMax = 100;
    return args;
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

function formatAddress(tags) {
    const street = tags["addr:street"];
    const num = tags["addr:housenumber"];
    const zip = tags["addr:postcode"];
    const city = tags["addr:city"] || "Berlin";
    if (!street) return zip ? `${zip} ${city}` : "";
    const line1 = num ? `${street} ${num}` : street;
    return zip ? `${line1}, ${zip} ${city}` : `${line1}, ${city}`;
}

function mapSmoking(raw) {
    if (!raw) return "unknown";
    const k = String(raw).toLowerCase().trim();
    return SMOKING_MAP[k] || "unknown";
}

function mapType(amenity) {
    if (amenity === "cafe") return "cafe";
    if (amenity === "restaurant") return "restaurant";
    return "bar";
}

async function overpass(query, attempt = 0) {
    let lastErr;
    // rotate start order slightly on retry
    const offset = attempt % OVERPASS_ENDPOINTS.length;
    const endpoints = [
        ...OVERPASS_ENDPOINTS.slice(offset),
        ...OVERPASS_ENDPOINTS.slice(0, offset),
    ];
    for (const url of endpoints) {
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "ExploresBerlin-VaultHarvest/1.0 (personal knowledge base)",
                },
                body: new URLSearchParams({ data: query }),
                signal: AbortSignal.timeout(120000),
            });
            if (!res.ok) {
                lastErr = new Error(`${url} HTTP ${res.status}`);
                continue;
            }
            const json = await res.json();
            console.log(`  Overpass OK via ${new URL(url).host}`);
            return json;
        } catch (e) {
            lastErr = e;
        }
    }
    if (attempt < 3) {
        const delay = 2000 * (attempt + 1);
        console.warn(
            `Overpass failed (attempt ${attempt + 1}): ${lastErr?.message || lastErr}. Retrying in ${delay}ms…`
        );
        await new Promise((r) => setTimeout(r, delay));
        return overpass(query, attempt + 1);
    }
    throw lastErr || new Error("Overpass request failed");
}

function buildQuery(amenities, bbox) {
    const [s, w, n, e] = bbox;
    const box = `(${s},${w},${n},${e})`;
    const cond = `["amenity"~"^(${amenities.join("|")})$"]`;
    return `[out:json][timeout:60];(node${cond}${box};way${cond}${box};);out center tags;`;
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function writeStubIfMissing(filePath, content) {
    if (fs.existsSync(filePath)) return false;
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, "utf8");
    return true;
}

function ensureTypeNote(type) {
    const file = path.join(VAULT, "types", `${type}.md`);
    const display = TYPE_DISPLAY[type];
    return writeStubIfMissing(
        file,
        `---\nrole: type\nname: ${display}\n---\n\n# ${display}\n\n> Backlinks list every place note linked to [[${display}]].\n`
    );
}

function ensureNeighborhoodNote(slug, label) {
    const file = path.join(VAULT, "neighborhoods", `${slug}.md`);
    return writeStubIfMissing(
        file,
        `---\nrole: neighborhood\nname: ${label}\n---\n\n# ${label}\n\n> Backlinks list every place note linked to [[${label}]].\n`
    );
}

function ensureSmokingNote(value) {
    const map = {
        smoking: ["smoking", "Smoking", "smoking"],
        "non-smoking": ["non-smoking", "Non-smoking", "non-smoking"],
        mixed: ["mixed", "Mixed", "mixed"],
        outdoor: ["outdoor", "Outdoor", "outdoor"],
        unknown: ["unknown", "Unknown", "unknown"],
    };
    const [fileName, title, kindVal] = map[value] || map.unknown;
    const file = path.join(VAULT, "attributes", `${fileName}.md`);
    return writeStubIfMissing(
        file,
        `---\nrole: attribute\nname: ${title}\nkind: smoking\nvalue: ${kindVal}\n---\n\n# ${title}\n\n> Backlinks list places with this smoking status.\n`
    );
}

function ensureDayNotes() {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "closed"];
    let n = 0;
    for (const d of days) {
        const title = d === "closed" ? "Closed" : d[0].toUpperCase() + d.slice(1);
        if (
            writeStubIfMissing(
                path.join(VAULT, "days", `${d}.md`),
                `---\nrole: day\nname: ${title}\n---\n\n# ${title}\n\n> Backlinks list places linked to [[${title}]].\n`
            )
        )
            n++;
    }
    return n;
}

function hourFileName(hhmm) {
    return hhmm.replace(":", "-"); // 17:00 → 17-00
}

function hourLink(hhmm) {
    // Plain time text — hour entity notes removed by request
    return hhmm;
}

function ensureCuisineNote(raw) {
    // raw like "italian", "cocktail_bar" → slug + Title
    const slug = slugify(raw);
    if (!slug) return false;
    const title = String(raw)
        .split(/[;_]/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ");
    const file = path.join(VAULT, "attributes", "cuisine", `${slug}.md`);
    return writeStubIfMissing(
        file,
        `---\nrole: attribute\nname: ${title}\nkind: cuisine\nvalue: ${slug}\n---\n\n# ${title}\n\n> Backlinks list places tagged with this cuisine.\n`
    );
}

function ensurePriceNote(priceRange) {
    if (!priceRange) return false;
    const file = path.join(VAULT, "attributes", "price", `${priceRange}.md`);
    return writeStubIfMissing(
        file,
        `---\nrole: price\nname: "${priceRange}"\n---\n\n# ${priceRange}\n\n> Backlinks list places at this price range.\n`
    );
}

function splitCuisine(raw) {
    if (!raw) return [];
    return String(raw)
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((r) => {
            const slug = slugify(r);
            const title = r
                .split(/[;_]/)
                .filter(Boolean)
                .map((w) => w[0].toUpperCase() + w.slice(1))
                .join(" ");
            return { raw: r, slug, title };
        })
        .filter((c) => c.slug);
}

function buildPlaceMarkdown(place) {
    const hoursYaml = {};
    for (const [k, v] of Object.entries(place.hours)) hoursYaml[k] = v;

    const data = {
        name: place.name,
        slug: place.slug,
        type: place.type,
        neighborhood: place.neighborhoodSlug,
        address: place.address || null,
        coordinates: { lat: place.lat, lng: place.lng },
        smoking: place.smoking,
        price_range: place.priceRange,
        cuisine: place.cuisineTags,
        tags: place.tags,
        website: place.website,
        phone: place.phone,
        opening_hours_raw: place.hoursRaw || null,
        hours: hoursYaml,
        source: "osm",
        source_id: place.sourceId,
        created: new Date().toISOString().slice(0, 10),
    };

    const typeDisplay = TYPE_DISPLAY[place.type];
    const hoodDisplay = place.neighborhoodLabel;
    const smokingDisplay = {
        smoking: "Smoking",
        "non-smoking": "Non-smoking",
        mixed: "Mixed",
        outdoor: "Outdoor",
        unknown: "Unknown",
    }[place.smoking];

    const links = [`[[${typeDisplay}]]`, `[[${hoodDisplay}]]`, `[[${smokingDisplay}]]`];
        if (place.priceRange) {
            links.push(`[[${place.priceRange}]]`);
            ensurePriceNote(place.priceRange);
        }
    for (const c of place.cuisineLinks) links.push(`[[${c.slug}|${c.title}]]`);

    const rows = hoursToRows(place.hours);
    const hoursTable = rows
        .map((r) => {
            if (!r.value) return `| [[${r.name}]] |  |  |`;
            if (r.value === "closed") return `| [[${r.name}]] | [[Closed]] |  |`;
            const first = r.value.split(",")[0].trim();
            const m = first.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
            if (m) return `| [[${r.name}]] | ${hourLink(m[1])} | ${hourLink(m[2])} |`;
            return `| [[${r.name}]] | ${r.value} |  |`;
        })
        .join("\n");

    const contact = [];
    if (place.website) contact.push(`- Website: ${place.website}`);
    if (place.phone) contact.push(`- Phone: ${place.phone}`);
    if (!contact.length) contact.push("-");

    const body = [
        `## Links`,
        links.join(" · "),
        ``,
        `## Address`,
        place.address || "",
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

function mergeIntoExisting(existingMatter, incoming, force) {
    const out = { ...existingMatter };
    const keys = Object.keys(incoming);
    for (const k of keys) {
        const prev = out[k];
        const next = incoming[k];
        const prevEmpty =
            prev === undefined ||
            prev === null ||
            prev === "" ||
            (Array.isArray(prev) && prev.length === 0) ||
            (typeof prev === "object" &&
                prev !== null &&
                !Array.isArray(prev) &&
                Object.keys(prev).every((kk) => prev[kk] === null || prev[kk] === undefined));
        if (force || prevEmpty || prev === undefined) {
            out[k] = next;
        } else if (
            k === "hours" &&
            typeof prev === "object" &&
            typeof next === "object"
        ) {
            // fill missing day keys only
            const merged = { ...prev };
            for (const [dk, dv] of Object.entries(next)) {
                if (merged[dk] === undefined || merged[dk] === null) merged[dk] = dv;
            }
            out[k] = merged;
        } else if (k === "coordinates" && typeof prev === "object") {
            if (prev.lat == null) prev.lat = next.lat;
            if (prev.lng == null) prev.lng = next.lng;
            out[k] = prev;
        }
    }
    return out;
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        console.log(`Usage: npm run vault:harvest -- --type bar --neighborhood kreuzberg
  --force            overwrite scraped fields (keeps ## Notes)
  --dry-run          no file writes
  --enrich google    require Google Maps match (keep only real places) + gap-fill
  --gap-only         with --enrich: only fill missing fields, no existence filter
  --revalidate       re-check places that already have google_place_id
  --google-max N     max Google search calls (default 100; 0 = skip)
  --no-google        OSM harvest only, skip Google entirely`);
        process.exit(0);
    }

    const type = args.type;
    const amenities = AMENITY_MAP[type];
    if (!amenities) {
        console.error(`Unknown type "${type}". Use bar | cafe | restaurant`);
        process.exit(1);
    }

    const area = areas[args.neighborhood];
    if (!area) {
        console.error(`Unknown neighborhood "${args.neighborhood}". Known:`, Object.keys(areas).join(", "));
        process.exit(1);
    }

    console.log(`Harvesting ${type} (${amenities.join("+")}) in ${area.label}…`);
    const query = buildQuery(amenities, area.bbox);
    const data = await overpass(query);
    const elements = (data.elements || []).filter((e) => e.tags && e.tags.name);
    console.log(`Overpass returned ${elements.length} named elements`);

    ensureTypeNote(type);
    ensureNeighborhoodNote(area.slug, area.label);
    ensureDayNotes();

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let warnings = 0;
    const usedSlugs = new Set();
    const hourSet = new Set();
    const cuisineSlugs = new Set();
    /** files touched this run for optional Google enrich */
    const writtenFiles = [];

    const placesDir = path.join(VAULT, "places", type, area.slug);
    ensureDir(placesDir);

    // Denylist: places Google rejected — never re-add from OSM
    const rejectDir = path.join(VAULT, "places", type, "_no_google");
    ensureDir(rejectDir);
    const rejectListPath = path.join(rejectDir, `${area.slug}-rejected.json`);
    let rejectSet = new Set();
    try {
        if (fs.existsSync(rejectListPath)) {
            const raw = JSON.parse(fs.readFileSync(rejectListPath, "utf8"));
            for (const id of raw.source_ids || []) rejectSet.add(id);
            console.log(`Loaded ${rejectSet.size} Google-rejected source_ids`);
        }
    } catch {
        /* start fresh */
    }

    // Index existing notes by source_id so renames don't duplicate
    const bySourceId = new Map();
    for (const f of fs.readdirSync(placesDir)) {
        if (!f.endsWith(".md")) continue;
        usedSlugs.add(f.replace(/\.md$/, ""));
        try {
            const d = matter(fs.readFileSync(path.join(placesDir, f), "utf8")).data;
            if (d.source_id) bySourceId.set(String(d.source_id), path.join(placesDir, f));
        } catch {
            /* ignore */
        }
    }

    for (const el of elements) {
        const tags = el.tags || {};
        const name = String(tags.name || "").trim();
        if (!name) {
            skipped++;
            continue;
        }

        const lat =
            el.lat ??
            (el.center && el.center.lat) ??
            null;
        const lng =
            el.lon ??
            (el.center && el.center.lon) ??
            (el.center && el.center.lng) ??
            null;
        if (lat == null || lng == null) {
            skipped++;
            continue;
        }

        const sourceId = `${el.type}/${el.id}`;
        if (rejectSet.has(sourceId)) {
            skipped++;
            continue;
        }

        let slug = slugify(name);
        if (!slug) {
            skipped++;
            continue;
        }

        let filePath = bySourceId.get(sourceId);
        if (!filePath) {
            if (usedSlugs.has(slug)) {
                // slug collision with different source — disambiguate
                let n = 2;
                while (usedSlugs.has(`${slug}_${n}`)) n++;
                slug = `${slug}_${n}`;
            }
            usedSlugs.add(slug);
            filePath = path.join(placesDir, `${slug}.md`);
        }

        const address = formatAddress(tags);
        const amenity = tags.amenity;
        const pType = mapType(amenity);
        const { hours, warnings: hw } = parseOpeningHours(tags.opening_hours);
        if (hw.length) warnings += hw.length;

        const smoking = mapSmoking(tags.smoking);
        ensureSmokingNote(smoking);

        const priceRange =
            tags.price === "$" || tags.price_level === "0"
                ? "€"
                : tags.price === "$$" || tags.price_level === "1"
                  ? "€€"
                  : tags.price === "$$$" || tags.price_level === "2"
                    ? "€€€"
                    : tags.price_range || null;

        const cuisineList = splitCuisine(tags.cuisine);
        for (const c of cuisineList) {
            if (!cuisineSlugs.has(c.slug)) {
                ensureCuisineNote(c.raw);
                cuisineSlugs.add(c.slug);
            }
        }

        const place = {
            name,
            slug,
            type: pType,
            neighborhoodSlug: area.slug,
            neighborhoodLabel: area.label,
            address,
            lat: Number(lat),
            lng: Number(lng),
            smoking,
            priceRange,
            cuisineTags: cuisineList.map((c) => c.slug),
            cuisineLinks: cuisineList,
            tags: [],
            website: tags.website || tags["contact:website"] || null,
            phone:
                tags.phone ||
                tags["contact:phone"] ||
                tags["contact:phone:mobile"] ||
                null,
            hoursRaw: tags.opening_hours || null,
            hours,
            sourceId: `${el.type}/${el.id}`,
        };

        for (const h of collectHourTokens(hours)) hourSet.add(h);

        const markdown = buildPlaceMarkdown(place);

        if (!fs.existsSync(filePath)) {
            if (!args.dryRun) {
                fs.writeFileSync(filePath, markdown, "utf8");
                writtenFiles.push(filePath);
                bySourceId.set(sourceId, filePath);
            }
            created++;
        } else {
            const existing = matter(fs.readFileSync(filePath, "utf8"));
            const incomingParsed = matter(markdown);
            const force = args.force;
            // Never clobber Google-adopted name/fields with OSM on normal runs
            const incomingData = { ...incomingParsed.data };
            if (existing.data.google_verified && !force) {
                for (const gk of [
                    "name",
                    "aliases",
                    "osm_name",
                    "google_name",
                    "google_place_id",
                    "google_verified",
                    "address",
                    "website",
                    "phone",
                    "opening_hours_raw",
                    "hours",
                    "price_range",
                ]) {
                    if (existing.data[gk] !== undefined && existing.data[gk] !== null) {
                        delete incomingData[gk];
                    }
                }
            }
            const before = JSON.stringify(existing.data);
            const merged = mergeIntoExisting(existing.data, incomingData, force);

            // On force, also refresh body sections but keep ## Notes
            if (force) {
                const notesMatch = existing.content.match(/\n## Notes\n([\s\S]*)$/);
                const notesPart = notesMatch
                    ? `\n## Notes\n${notesMatch[1]}`
                    : `\n## Notes\n`;
                const incomingBody = incomingParsed.content.replace(
                    /\n## Notes\n[\s\S]*$/,
                    "\n"
                );
                if (!args.dryRun) {
                    fs.writeFileSync(
                        filePath,
                        matter.stringify(incomingBody + notesPart, merged),
                        "utf8"
                    );
                    writtenFiles.push(filePath);
                }
                updated++;
            } else if (JSON.stringify(merged) !== before) {
                if (!args.dryRun) {
                    fs.writeFileSync(
                        filePath,
                        matter.stringify(existing.content, merged),
                        "utf8"
                    );
                    writtenFiles.push(filePath);
                }
                updated++;
            } else {
                // unchanged OSM data — still eligible for Google validate
                if (!args.dryRun) writtenFiles.push(filePath);
                skipped++;
            }
        }
    }

    // Create hour notes after we know all times
    let hoursCreated = 0;
    if (!args.dryRun) {
        for (const h of hourSet) {
            if (ensureHourNote(h)) hoursCreated++;
        }
    }

    // --- Optional Google validate + gap-fill ---
    let enrichSummary = null;
    const wantEnrich =
        !args.skipGoogle &&
        (args.enrich === "google" || args.enrich === "places") &&
        args.googleMax > 0;
    if (wantEnrich) {
        // Validate the full graph folder (not just OSM-touched files)
        const targets = [];
        const seen = new Set();
        const loadTargets = (dir) => {
            if (!fs.existsSync(dir)) return;
            for (const f of fs.readdirSync(dir)) {
                if (!f.endsWith(".md")) continue;
                const full = path.join(dir, f);
                if (seen.has(full)) continue;
                seen.add(full);
                try {
                    const raw = fs.readFileSync(full, "utf8");
                    const parsed = matter(raw);
                    // gray-matter may share cached objects — clone before mutate
                    targets.push({
                        file: full,
                        data: JSON.parse(JSON.stringify(parsed.data)),
                        content: parsed.content,
                        snapshot: JSON.parse(JSON.stringify(parsed.data)),
                    });
                } catch {
                    /* skip unreadable */
                }
            }
        };
        loadTargets(placesDir);

        enrichSummary = await enrichPlaces(targets, {
            googleMax: args.googleMax,
            dryRun: args.dryRun,
            areaLabel: area.label,
            validate: !args.gapOnly,
            revalidate: args.revalidate,
        });

        if (!args.dryRun) {
            let saved = 0;
            let renamed = 0;
            let moved = 0;

            for (const item of targets) {
                const { file, data, snapshot, content, status } = item;

                if (status === "reject") {
                    const destDir = path.join(rejectDir, area.slug);
                    ensureDir(destDir);
                    const base = path.basename(file);
                    let dest = path.join(destDir, base);
                    if (fs.existsSync(dest)) {
                        dest = path.join(destDir, `${Date.now()}-${base}`);
                    }
                    // Annotate then move out of the live graph
                    data.google_rejected = true;
                    data.google_reject_score = item.matchScore || 0;
                    if (item.googleName) data.google_reject_near = item.googleName;
                    const rejectedMd = matter.stringify(
                        `# ${data.name || base}\n\nRejected: no confident Google Maps match.\n\n` + content,
                        data
                    );
                    fs.writeFileSync(dest, rejectedMd, "utf8");
                    fs.unlinkSync(file);
                    if (data.source_id) rejectSet.add(String(data.source_id));
                    moved++;
                    continue;
                }

                if (
                    status === "keep" ||
                    status === "keep-patched"
                ) {
                    if (JSON.stringify(data) === JSON.stringify(snapshot)) {
                        continue;
                    }
                    // Rename file if Google name → different slug
                    let targetPath = file;
                    const newSlug = slugify(data.name || "");
                    const oldBase = path.basename(file, ".md");
                    if (newSlug && newSlug !== oldBase) {
                        const candidate = path.join(path.dirname(file), `${newSlug}.md`);
                        if (!fs.existsSync(candidate) || candidate === file) {
                            data.slug = newSlug;
                            targetPath = candidate;
                        }
                    }
                    const rebuilt = rebuildPlaceFile(content, data);
                    if (targetPath !== file && fs.existsSync(file)) {
                        fs.renameSync(file, targetPath);
                        renamed++;
                    }
                    fs.writeFileSync(targetPath, rebuilt, "utf8");
                    if (bySourceId.get(String(data.source_id)) !== targetPath) {
                        if (data.source_id) bySourceId.set(String(data.source_id), targetPath);
                    }
                    saved++;
                }
            }

            if (moved) {
                // Persist denylist
                const payload = {
                    updated: new Date().toISOString(),
                    area: area.slug,
                    source_ids: [...rejectSet],
                };
                fs.writeFileSync(rejectListPath, JSON.stringify(payload, null, 2), "utf8");
            }
            if (saved || renamed || moved) {
                console.log(
                    `Google: wrote ${saved}, renamed ${renamed}, moved to _no_google ${moved}`
                );
            }
        }
    } else if (args.enrich === "google" && args.googleMax === 0) {
        console.log("Google enrich skipped (--google-max 0).");
    }

    console.log(`
Done.
  created:  ${created}
  updated:  ${updated}
  skipped:  ${skipped}  (no change / no coords / denylisted)
  warnings: ${warnings}  (OSM hours parse)
  hour notes created this run: ${hoursCreated}
  folder:   ${placesDir}
${enrichSummary ? `  google:   checked=${enrichSummary.attempted} matched=${enrichSummary.matched} rejected=${enrichSummary.rejected} patched=${enrichSummary.patched} renamed=${enrichSummary.renamed} errors=${enrichSummary.errors} alreadyVerified=${enrichSummary.skippedVerified} calls≈${enrichSummary.callsUsed}` : ""}
`);
}

/** Rebuild place markdown body while preserving ## Notes and existing frontmatter merge target `data`. */
function rebuildPlaceFile(existingContent, data) {
    const typeDisplay = TYPE_DISPLAY[data.type] || data.type;
    const hoodDisplay =
        data.neighborhood === "kreuzberg"
            ? "Kreuzberg"
            : String(data.neighborhood || "");
    // neighborhood slug → label from areas if possible
    let hood = hoodDisplay;
    for (const a of Object.values(areas)) {
        if (a.slug === data.neighborhood) hood = a.label;
    }
    const smokingDisplay = {
        smoking: "Smoking",
        "non-smoking": "Non-smoking",
        mixed: "Mixed",
        outdoor: "Outdoor",
        unknown: "Unknown",
    }[data.smoking] || "Unknown";

    const links = [`[[${typeDisplay}]]`];
    if (hood) links.push(`[[${hood}]]`);
    links.push(`[[${smokingDisplay}]]`);
    if (data.price_range) links.push(`[[${data.price_range}]]`);
    const cuisine = Array.isArray(data.cuisine) ? data.cuisine : [];
    for (const c of cuisine) {
        // frontmatter stores slugs; display title-cased
        const title = String(c)
            .split(/[_\s-]+/)
            .filter(Boolean)
            .map((w) => w[0].toUpperCase() + w.slice(1))
            .join(" ");
        links.push(`[[${c}|${title}]]`);
    }

    const hours = data.hours || {};
    const rows = hoursToRows(hours);
    const hoursTable = rows
        .map((r) => {
            if (!r.value) return `| [[${r.name}]] |  |  |`;
            if (r.value === "closed") return `| [[${r.name}]] | [[Closed]] |  |`;
            const first = r.value.split(",")[0].trim();
            const m = first.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
            if (m)
                return `| [[${r.name}]] | ${hourLink(m[1])} | ${hourLink(m[2])} |`;
            return `| [[${r.name}]] | ${r.value} |  |`;
        })
        .join("\n");

    const contact = [];
    if (data.website) contact.push(`- Website: ${data.website}`);
    if (data.phone) contact.push(`- Phone: ${data.phone}`);
    if (!contact.length) contact.push("-");

    const notesMatch = existingContent.match(/\n## Notes\n([\s\S]*)$/);
    const notesPart = notesMatch ? `## Notes\n${notesMatch[1]}` : `## Notes\n`;

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
        notesPart.replace(/^\n/, ""),
    ].join("\n");

    return matter.stringify(body, data);
}

main().catch((err) => {
    console.error("Harvest failed:", err);
    process.exit(1);
});
