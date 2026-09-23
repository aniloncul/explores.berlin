/**
 * Google Places (legacy Web Service) + Geocoding helpers for vault gap-fill.
 * Uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY from env.
 * Legacy endpoints verified working on this key; Places API (New) :searchText returns 404.
 */

const PLACES_SEARCH = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const PLACES_DETAILS = "https://maps.googleapis.com/maps/api/place/details/json";
const PLACES_NEARBY = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const GEOCODE_BASE = "https://maps.googleapis.com/maps/api/geocode/json";

const DETAIL_FIELDS = [
    "place_id",
    "name",
    "formatted_address",
    "geometry",
    "website",
    "formatted_phone_number",
    "international_phone_number",
    "opening_hours",
    "price_level",
    "types",
].join(",");

function getApiKey() {
    const key =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
        process.env.GOOGLE_MAPS_API_KEY;
    if (!key) throw new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
    return key;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function googleGet(url) {
    const res = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: { Accept: "application/json" },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        throw new Error(`Google status ${data.status}: ${data.error_message || ""}`);
    }
    return data;
}

async function placesTextSearch(query, { pageToken = null } = {}) {
    const key = getApiKey();
    const url = new URL(PLACES_SEARCH);
    url.searchParams.set("query", query);
    url.searchParams.set("key", key);
    url.searchParams.set("language", "de");
    url.searchParams.set("region", "de");
    if (pageToken) url.searchParams.set("pagetoken", pageToken);
    return googleGet(url.toString());
}

/** Page through Text Search (max 3 pages / 60 results per query). */
async function placesTextSearchPaged(query, { maxPages = 3, delayMs = 200 } = {}) {
    const all = [];
    let pageToken = null;
    let pages = 0;
    do {
        const res = await placesTextSearch(query, { pageToken });
        const results = res.results || [];
        all.push(...results);
        pages++;
        pageToken = res.next_page_token || null;
        if (pageToken && pages < maxPages) {
            await sleep(delayMs || 200);
        } else {
            pageToken = null;
        }
    } while (pageToken && pages < maxPages);
    return { results: all, pages };
}

async function placesDetails(placeId) {
    const key = getApiKey();
    const url = new URL(PLACES_DETAILS);
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("fields", DETAIL_FIELDS);
    url.searchParams.set("key", key);
    url.searchParams.set("language", "de");
    url.searchParams.set("region", "de");
    return googleGet(url.toString());
}

/**
 * Places API (New) Get Place — returns primaryType (Google Maps' real category).
 * Legacy types[] is alphabetical, so it cannot be used as primary.
 */
async function placesDetailsNew(placeId) {
    const key = getApiKey();
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
    const res = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: {
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "id,displayName,types,primaryType,primaryTypeDisplayName,formattedAddress,location,websiteUri,regularOpeningHours,priceLevel,rating,userRatingCount",
            "Content-Type": "application/json",
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Places New HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
}

async function placesNearby(lat, lng, radius = 80, { type = null, pageToken = null } = {}) {
    const key = getApiKey();
    const url = new URL(PLACES_NEARBY);
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("radius", String(radius));
    url.searchParams.set("key", key);
    url.searchParams.set("language", "de");
    url.searchParams.set("region", "de");
    if (type) url.searchParams.set("type", type);
    if (pageToken) url.searchParams.set("pagetoken", pageToken);
    return googleGet(url.toString());
}

async function reverseGeocode(lat, lng) {
    const key = getApiKey();
    const url = `${GEOCODE_BASE}?latlng=${lat},${lng}&key=${key}&language=de&result_type=neighborhood|sublocality|locality`;
    const data = await googleGet(url);
    return data.results || [];
}

function normalize(s) {
    return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ß/g, "ss")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function extractStreet(address) {
    const m = String(address || "").match(/^(.+?\s\d+[a-z]?)\s*,/i);
    return m ? m[1] : String(address || "").split(",")[0] || "";
}

function scoreMatch(place, { name, address }) {
    const pName = normalize(place.name);
    const nName = normalize(name);
    if (!pName || !nName) return 0;
    const pTight = pName.replace(/\s+/g, "");
    const nTight = nName.replace(/\s+/g, "");
    let score = 0;
    if (pName === nName || pTight === nTight) score += 50;
    else if (
        pName.includes(nName) ||
        nName.includes(pName) ||
        pTight.includes(nTight) ||
        nTight.includes(pTight)
    ) {
        score += 30;
    } else {
        const pt = new Set(pName.split(" "));
        const nt = nName.split(" ");
        const hit = nt.filter((t) => pt.has(t)).length;
        if (hit && hit / nt.length >= 0.6) score += 15;
        else return 0;
    }

    const pAddr = normalize(place.formatted_address);
    const nAddr = normalize(address);
    if (nAddr && pAddr) {
        if (pAddr.includes(nAddr) || nAddr.includes(pAddr)) score += 40;
        else {
            const street = normalize(extractStreet(address));
            if (street && pAddr.includes(street)) score += 25;
            const zip = (address || "").match(/\b\d{5}\b/);
            if (zip && pAddr.includes(zip[0])) score += 15;
        }
    }
    return score;
}

function googlePriceToRange(priceLevel) {
    const map = { 0: "€", 1: "€€", 2: "€€€", 3: "€€€" };
    if (priceLevel == null) return null;
    return map[priceLevel] ?? null;
}

/** weekday_text: ["Monday: 6:0 AM – 1:0 AM", "Tuesday: Closed", ...] */
function parseWeekdayText(lines) {
    const hours = {
        mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null,
    };
    const map = {
        Monday: "mon", Tuesday: "tue", Wednesday: "wed", Thursday: "thu",
        Friday: "fri", Saturday: "sat", Sunday: "sun",
        Montag: "mon", Dienstag: "tue", Mittwoch: "wed", Donnerstag: "thu",
        Freitag: "fri", Samstag: "sat", Sonntag: "sun",
    };
    function to24(t) {
        let s = String(t).trim().replace(/Uhr$/i, "").trim();
        const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (m) {
            let h = Number(m[1]) % 12;
            if (/pm/i.test(m[3])) h += 12;
            return `${String(h).padStart(2, "0")}:${m[2]}`;
        }
        const m2 = s.match(/^(\d{1,2}):(\d)\s*(AM|PM)$/i);
        if (m2) {
            let h = Number(m2[1]) % 12;
            if (/pm/i.test(m2[3])) h += 12;
            return `${String(h).padStart(2, "0")}:0${m2[2]}`;
        }
        const h24 = s.match(/^(\d{1,2}):(\d{2})$/);
        if (h24) return `${String(h24[1]).padStart(2, "0")}:${h24[2]}`;
        const p = s.match(/^(\d{2})(\d{2})$/);
        if (p) return `${p[1]}:${p[2]}`;
        return null;
    }
    for (const line of lines || []) {
        const m = line.match(/^([A-Za-zäöüÄÖÜ]+):\s*(.+)$/);
        if (!m) continue;
        const key = map[m[1]];
        if (!key) continue;
        const range = m[2];
        if (/closed|geschlossen/i.test(range)) {
            hours[key] = "closed";
            continue;
        }
        const rm = range.match(/(.+?)\s*[–-]\s*(.+)$/);
        if (!rm) continue;
        const open = to24(rm[1]);
        const close = to24(rm[2]);
        if (open && close) hours[key] = `${open}-${close}`;
    }
    return hours;
}

/** Fallback from opening_hours.periods when weekday_text missing */
function periodsToHours(periods) {
    const hours = {
        mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null,
    };
    const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    for (const p of periods || []) {
        if (!p.open) continue;
        const d = keys[p.open.day];
        if (!d) continue;
        const oh = String(p.open.time || "").padStart(4, "0");
        const ch = p.close ? String(p.close.time || "").padStart(4, "0") : null;
        const open = `${oh.slice(0, 2)}:${oh.slice(2)}`;
        if (ch) {
            const close = `${ch.slice(0, 2)}:${ch.slice(2)}`;
            hours[d] = `${open}-${close}`;
        }
    }
    return hours;
}

function needsEnrichment(data) {
    const missingWebsite = !data.website;
    const missingPhone = !data.phone;
    const missingAddress = !data.address;
    const hoursEmpty =
        !data.opening_hours_raw &&
        (!data.hours || Object.values(data.hours).every((v) => !v));
    return missingWebsite || missingPhone || missingAddress || hoursEmpty;
}

/**
 * Strict existence check: require a confident name match on Google.
 * - Exact or space-insensitive exact name → keep
 * - Near/contained name → keep only with address corroboration
 *   (or prefix-style match when both names are reasonably long and no address)
 */
function isConfidentMatch(match, { name, address }) {
    if (!match || !match.place || !match.place.place_id) return false;
    const pName = normalize(match.place.name);
    const nName = normalize(name);
    if (!pName || !nName) return false;
    const pTight = pName.replace(/\s+/g, "");
    const nTight = nName.replace(/\s+/g, "");
    const nameExact = pName === nName || pTight === nTight;
    const nameNear =
        pName.includes(nName) ||
        nName.includes(pName) ||
        pTight.includes(nTight) ||
        nTight.includes(pTight);

    if (nameExact) return true;
    if (!nameNear) return false;

    const pAddr = normalize(match.place.formatted_address);
    const nAddr = normalize(address);
    let streetOk = false;
    let zipOk = false;
    if (address && pAddr && nAddr) {
        const street = normalize(extractStreet(address));
        const zip = (address || "").match(/\b\d{5}\b/);
        streetOk = !!(street && pAddr.includes(street));
        zipOk = !!(zip && pAddr.includes(zip[0]));
        if (
            streetOk ||
            zipOk ||
            pAddr.includes(nAddr) ||
            nAddr.includes(pAddr)
        ) {
            return true;
        }
        // has address but doesn't line up → reject near-miss
        return false;
    }

    // no usable address: only long prefix-style near matches
    const shorter = Math.min(pTight.length, nTight.length);
    const longer = Math.max(pTight.length, nTight.length);
    const prefix =
        (pTight.startsWith(nTight) || nTight.startsWith(pTight)) &&
        longer >= shorter + 1;
    return prefix && shorter >= 5;
}

async function findBestMatch({ name, address, neighborhoodLabel }) {
    const q = [name, address || neighborhoodLabel || "Berlin", "Berlin"]
        .filter(Boolean)
        .join(", ");
    const search = await placesTextSearch(q);
    const candidates = search.results || [];
    if (!candidates.length) return null;

    let best = null;
    let bestScore = 0;
    for (const p of candidates) {
        const s = scoreMatch(p, { name, address });
        if (s > bestScore) {
            bestScore = s;
            best = p;
        }
    }
    if (!best || bestScore < 30 || !best.place_id) return null;

    try {
        const details = await placesDetails(best.place_id);
        const result = details.result || {};
        return {
            place: { ...best, ...result },
            score: bestScore,
            usedDetails: true,
        };
    } catch {
        return { place: best, score: bestScore, usedDetails: false };
    }
}

function googleResultToPatch(place) {
    const patch = {};
    if (place.formatted_address) patch.address = place.formatted_address;
    if (place.geometry?.location?.lat != null) {
        patch.coordinates = {
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng,
        };
    }
    const phone =
        place.international_phone_number || place.formatted_phone_number;
    if (phone) patch.phone = phone;
    if (place.website) patch.website = place.website;

    const oh = place.opening_hours;
    if (oh) {
        if (Array.isArray(oh.weekday_text) && oh.weekday_text.length) {
            patch.opening_hours_raw = oh.weekday_text.join("; ");
            patch.hours = parseWeekdayText(oh.weekday_text);
        } else if (Array.isArray(oh.periods) && oh.periods.length) {
            patch.hours = periodsToHours(oh.periods);
            const parts = Object.entries(patch.hours)
                .filter(([, v]) => v)
                .map(([d, v]) => `${d}:${v}`);
            if (parts.length) patch.opening_hours_raw = parts.join(", ");
        }
    }

    const price = googlePriceToRange(place.price_level);
    if (price) patch.price_range = price;

    return patch;
}

function applyPatch(data, patch) {
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
        const cur = data[k];
        const empty =
            cur == null ||
            cur === "" ||
            (Array.isArray(cur) && !cur.length) ||
            (k === "hours" &&
                cur &&
                Object.values(cur).every((x) => !x));
        if (empty && v != null && v !== "") {
            data[k] = v;
            changed = true;
        }
    }
    return changed;
}

/**
 * Adopt Google's official name; keep OSM name as alias.
 * Returns true if name changed (file should be renamed).
 */
function adoptGoogleName(data, googleName) {
    if (!googleName) return false;
    const osmName = data.name;
    if (normalize(googleName) === normalize(osmName)) {
        // prefer Google casing/display if only whitespace/case differ
        if (googleName !== osmName) {
            data.name = googleName;
            return false; // same slug likely
        }
        return false;
    }
    const aliases = Array.isArray(data.aliases) ? data.aliases.slice() : [];
    if (osmName && !aliases.includes(osmName)) aliases.push(osmName);
    data.aliases = aliases;
    data.name = googleName;
    data.osm_name = data.osm_name || osmName;
    return true;
}

/**
 * Validate + gap-fill against Google Places.
 * - validate=true (default): every place must confidently match Google
 *   or it is marked reject. Places already carrying google_place_id are
 *   skipped unless revalidate=true.
 * - validate=false: only gap-fill places missing fields (no existence check).
 */
async function enrichPlaces(
    places,
    {
        googleMax = 100,
        dryRun = false,
        areaLabel,
        validate = true,
        revalidate = false,
    } = {}
) {
    const results = {
        attempted: 0,
        matched: 0,
        patched: 0,
        rejected: 0,
        noMatch: 0,
        errors: 0,
        callsUsed: 0,
        renamed: 0,
        skippedVerified: 0,
        details: [],
    };

    let queue;
    if (validate) {
        queue = places.filter((p) => {
            if (!revalidate && p.data.google_place_id) {
                results.skippedVerified++;
                return false;
            }
            return true;
        });
    } else {
        queue = places.filter((p) => needsEnrichment(p.data));
    }

    results.attempted = queue.length;
    console.log(
        `Google ${validate ? "validate+enrich" : "enrich"}: ${queue.length} to check` +
            (results.skippedVerified
                ? ` (${results.skippedVerified} already verified)`
                : "") +
            ` (cap ${googleMax} searches)…`
    );

    if (dryRun) {
        console.log(
            `[dry-run] would call Google for ${Math.min(queue.length, googleMax)} places`
        );
        return results;
    }

    for (const item of queue) {
        if (results.callsUsed >= googleMax) {
            console.log(`Reached --google-max ${googleMax}, stopping.`);
            break;
        }

        const { data } = item;
        try {
            results.callsUsed += 1;
            const match = await findBestMatch({
                name: data.name || data.google_name || data.osm_name,
                address: data.address,
                neighborhoodLabel: areaLabel,
            });

            const confident = isConfidentMatch(match, {
                name: data.name || data.google_name || data.osm_name,
                address: data.address,
            });

            if (!match || !confident) {
                results.noMatch++;
                results.rejected++;
                item.status = "reject";
                item.matchScore = match ? match.score : 0;
                item.googleName = match?.place?.name || null;
                results.details.push({
                    name: data.name,
                    status: "reject",
                    score: match ? match.score : 0,
                    googleName: match?.place?.name || null,
                });
                await sleep(120);
                continue;
            }

            results.matched++;
            item.status = "keep";
            item.matchScore = match.score;
            item.placeId = match.place.place_id;

            const renamed = adoptGoogleName(data, match.place.name);
            if (renamed) results.renamed++;

            const patch = googleResultToPatch(match.place);
            const changed = applyPatch(data, patch);
            data.google_place_id = match.place.place_id;
            data.google_name = match.place.name;
            data.google_verified = true;
            if (changed) results.patched++;

            item.status = changed || renamed ? "keep-patched" : "keep";
            results.details.push({
                name: data.name,
                status: item.status,
                score: match.score,
                googleName: match.place.name,
                phone: data.phone || null,
                website: data.website || null,
            });
            await sleep(200);
        } catch (e) {
            results.errors++;
            item.status = "error";
            results.details.push({
                name: data.name,
                status: "error",
                error: String(e.message || e),
            });
            await sleep(500);
        }
    }

    return results;
}

module.exports = {
    enrichPlaces,
    findBestMatch,
    reverseGeocode,
    needsEnrichment,
    googleResultToPatch,
    isConfidentMatch,
    adoptGoogleName,
    placesDetails,
    placesDetailsNew,
    placesNearby,
    placesTextSearch,
    placesTextSearchPaged,
    normalize,
    extractStreet,
    parseWeekdayText,
    periodsToHours,
    googlePriceToRange,
};
