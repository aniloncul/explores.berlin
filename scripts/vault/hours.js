/**
 * Parse OSM opening_hours into per-day "HH:MM-HH:MM" (or null / closed).
 * Supports common venue patterns; always keep raw string as fallback.
 */

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_NAME = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
};

const DAY_TOKENS = {
    Mo: "mon", Tu: "tue", We: "wed", Th: "thu", Fr: "fri", Sa: "sat", Su: "sun",
    Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat", Sun: "sun",
    Monday: "mon", Tuesday: "tue", Wednesday: "wed", Thursday: "thu",
    Friday: "fri", Saturday: "sat", Sunday: "sun",
};

function normTime(t) {
    if (!t) return null;
    const m = String(t).trim().match(/^(\d{1,2}):?(\d{2})?$/);
    if (!m) return null;
    const h = String(Number(m[1])).padStart(2, "0");
    const min = (m[2] || "00").padStart(2, "0");
    return `${h}:${min}`;
}

function parseTimeRange(part) {
    // "17:00-02:00", "17:00-02:00+", "17-2", "off", "closed"
    const s = part.trim();
    if (!s || /^(off|closed)$/i.test(s)) return { closed: true };
    const m = s.match(/^(\d{1,2}:?\d{2})\s*-\s*(\d{1,2}:?\d{2})\+?$/);
    if (!m) return null;
    const open = normTime(m[1]);
    const close = normTime(m[2]);
    if (!open || !close) return null;
    return { open, close };
}

function expandDayList(token) {
    // "Mo-Fr", "Mo,We,Fr", "Sa-Su", "Mo-We,Fr"
    const days = new Set();
    const parts = token.split(",").map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
        const range = part.match(/^([A-Za-z]+)\s*-\s*([A-Za-z]+)$/);
        if (range) {
            const a = DAY_TOKENS[range[1]];
            const b = DAY_TOKENS[range[2]];
            if (!a || !b) return null;
            const ia = DAY_KEYS.indexOf(a);
            const ib = DAY_KEYS.indexOf(b);
            if (ia === -1 || ib === -1) return null;
            let i = ia;
            for (;;) {
                days.add(DAY_KEYS[i]);
                if (i === ib) break;
                i = (i + 1) % 7;
                if (i === ia) break; // safety
            }
            continue;
        }
        const single = DAY_TOKENS[part];
        if (single) days.add(single);
        else return null;
    }
    return days.size ? [...days] : null;
}

function emptyHours() {
    const h = {};
    for (const d of DAY_KEYS) h[d] = null;
    return h;
}

/**
 * @param {string|null|undefined} raw
 * @returns {{ hours: Record<string,string|null>, warnings: string[] }}
 * hours values: "17:00-02:00" | "closed" | null
 */
function parseOpeningHours(raw) {
    const warnings = [];
    const hours = emptyHours();
    if (!raw || !String(raw).trim()) return { hours, warnings };

    const s = String(raw).trim();
    // split top-level rules on ";" (ignore inside brackets roughly)
    const rules = s.split(";").map((r) => r.trim()).filter(Boolean);

    for (const rule of rules) {
        // optional "24/7"
        if (/^24\s*\/\s*7$/i.test(rule)) {
            for (const d of DAY_KEYS) hours[d] = "00:00-24:00";
            continue;
        }

        // "Mo-Fr 17:00-02:00" | "Mo-Su 11:00-23:00, 12:00-15:00" | "off" alone
        // Also "PH off" etc — skip non-day prefixes lightly
        let dayPart = null;
        let timePart = rule;

        const dayMatch = rule.match(/^([A-Za-z]+(?:\s*-\s*[A-Za-z]+)?(?:\s*,\s*[A-Za-z]+(?:\s*-\s*[A-Za-z]+)?)*)\s+(.+)$/);
        if (dayMatch && expandDayList(dayMatch[1])) {
            dayPart = dayMatch[1];
            timePart = dayMatch[2];
        } else {
            // maybe entire rule is just days (no times) → treat as unknown
            const onlyDays = expandDayList(rule);
            if (onlyDays && /Mo|Tu|We|Th|Fr|Sa|Su|Mon|Tue|Wed|Thu|Fri|Sat|Sun/i.test(rule)) {
                warnings.push(`Rule without times: ${rule}`);
                continue;
            }
        }

        const days = dayPart ? expandDayList(dayPart) : DAY_KEYS.slice();
        if (!days) {
            warnings.push(`Unparsed rule: ${rule}`);
            continue;
        }

        // multiple time ranges comma-separated within a day group: take first non-fail; if "off"
        if (/^(off|closed)$/i.test(timePart.trim())) {
            for (const d of days) hours[d] = "closed";
            continue;
        }

        const ranges = timePart.split(",").map((r) => r.trim()).filter(Boolean);
        const parsed = [];
        let bad = false;
        for (const r of ranges) {
            const pr = parseTimeRange(r);
            if (!pr) {
                bad = true;
                break;
            }
            if (pr.closed) continue;
            parsed.push(pr);
        }
        if (bad || parsed.length === 0) {
            // try whole timePart as single range
            const pr = parseTimeRange(ranges[0] || timePart);
            if (pr && !pr.closed) {
                const val = `${pr.open}-${pr.close}`;
                for (const d of days) hours[d] = val;
            } else {
                warnings.push(`Unparsed times: ${rule}`);
            }
            continue;
        }

        // If multiple ranges for same day, join with comma (rare)
        for (const d of days) {
            const vals = parsed.map((p) => `${p.open}-${p.close}`);
            const existing = hours[d];
            if (existing && existing !== "closed" && !vals.includes(existing)) {
                hours[d] = `${existing}, ${vals.filter((v) => !existing.includes(v)).join(", ")}`;
            } else {
                hours[d] = vals.join(", ");
            }
        }
    }

    return { hours, warnings };
}

/** Collect distinct "HH:MM" tokens from parsed hours for hour entity notes. */
function collectHourTokens(hours) {
    const set = new Set();
    for (const v of Object.values(hours || {})) {
        if (!v || v === "closed") continue;
        for (const range of v.split(",")) {
            const m = range.trim().match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
            if (m) {
                set.add(m[1]);
                set.add(m[2]);
            }
        }
    }
    return [...set];
}

function hoursToRows(hours) {
    const rows = [];
    for (const key of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
        const val = hours?.[key] || null;
        rows.push({ key, name: DAY_NAME[key], value: val });
    }
    return rows;
}

module.exports = {
    parseOpeningHours,
    collectHourTokens,
    hoursToRows,
    DAY_KEYS,
    DAY_NAME,
};
