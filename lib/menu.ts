export interface MenuItem {
    name: string;
    price: number;
}

export interface MenuSection {
    title: string | null;
    columns: string[];
    rows: string[][];
}

const VOL_RE = /^(\d+[,.]?\d*)\s*(l|cl|ml)$/i;

function splitCells(line: string): string[] {
    return line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim());
}

/** Section-aware parse: "### " headings + tables in any column shape. */
export function parseMenuSections(menuMd?: string | null): MenuSection[] {
    if (!menuMd) return [];
    const sections: MenuSection[] = [];
    let title: string | null = null;
    let columns: string[] | null = null;
    let rows: string[][] = [];
    const flush = () => {
        if (columns && rows.length) sections.push({ title, columns, rows });
        columns = null;
        rows = [];
    };
    for (const line of menuMd.split(/\r?\n/)) {
        const t = line.trim();
        if (t.startsWith("### ")) {
            flush();
            title = t.slice(4).trim() || null;
            continue;
        }
        if (!t.startsWith("|")) continue;
        const cells = splitCells(t);
        if (cells.length < 2) continue;
        if (/^[-\s:]+$/.test(cells[0])) continue;
        if (/^item$/i.test(cells[0])) {
            flush();
            columns = cells;
            continue;
        }
        if (!columns) continue;
        rows.push(cells);
    }
    flush();
    return sections;
}

/** Lowest price across ALL price-like cells (any column shape). */
export function lowestPriceAny(menuMd?: string | null): number | null {
    const sections = parseMenuSections(menuMd);
    // Fall back to legacy flat parse when no headed tables exist
    if (!sections.length) {
        const items = parseMenuMd(menuMd);
        if (!items.length) return null;
        return Math.min(...items.map((i) => i.price));
    }
    let min: number | null = null;
    for (const s of sections) {
        const priceIdx = s.columns
            .map((c, i) => (i === 0 ? -1 : parsePriceCell(c) !== null || VOL_RE.test(c) ? i : -1))
            .filter((i) => i >= 0);
        const idxs = priceIdx.length ? priceIdx : s.columns.map((_, i) => i).slice(1);
        for (const r of s.rows) {
            for (const i of idxs) {
                const p = parsePriceCell(r[i] || "");
                if (p != null && (min == null || p < min)) min = p;
            }
        }
    }
    return min;
}

const DONER_RE = /d[öo]ner|doner|kebap|kebab|d[üu]r[üu]m|dürüm|pide|lahmacun|adana/i;

export function isDonerish(name: string): boolean {
    return DONER_RE.test(String(name || ""));
}

function parsePriceCell(cell: string): number | null {
    const m = cell.match(/(\d{1,2})[.,](\d{2})/) || cell.match(/(\d{1,2})[.,](\d{1})(?![\d])/);
    if (!m) return null;
    const n = Number(`${m[1]}.${m[2].length === 1 ? m[2] + "0" : m[2]}`);
    return Number.isFinite(n) && n >= 1.5 && n <= 40 ? n : null;
}

/** Parse markdown menu(s) into flat rows. Section headings ignored;
 *  size-column tables expand to one row per size ("Name (0,3L)"). */
export function parseMenuMd(menuMd?: string | null): MenuItem[] {
    if (!menuMd) return [];
    const rows: MenuItem[] = [];
    let vols: string[] | null = null;
    for (const line of menuMd.split(/\r?\n/)) {
        const t = line.trim();
        if (t.startsWith("### ")) {
            vols = null;
            continue;
        }
        if (!t.startsWith("|")) continue;
        const cells = splitCells(t);
        if (cells.length < 2) continue;
        if (/^[-\s:]+$/i.test(cells[0])) continue;
        if (/^item$/i.test(cells[0])) {
            vols = cells.length > 2 && cells.slice(1).every((c) => VOL_RE.test(c)) ? cells.slice(1) : null;
            continue;
        }
        if (vols) {
            const name = cells[0].replace(/\\\|/g, "|").trim();
            if (!name) continue;
            for (let i = 0; i < vols.length; i++) {
                const price = parsePriceCell(cells[i + 1] || "");
                if (price == null) continue;
                rows.push({ name: `${name} (${vols[i]})`, price });
            }
            continue;
        }
        const price = parsePriceCell(cells[cells.length - 1] || "");
        if (price == null) continue;
        const name = cells[0].replace(/\\\|/g, "|").trim();
        if (!name) continue;
        rows.push({ name, price });
    }
    return rows;
}

/** Lowest döner-ish price; falls back to overall min when no doner match. */
export function lowestDonerPrice(menuMd?: string | null): number | null {
    const items = parseMenuMd(menuMd);
    if (!items.length) return null;
    const doner = items.filter((i) => isDonerish(i.name));
    const pool = doner.length ? doner : items;
    return Math.min(...pool.map((i) => i.price));
}

export function formatPrice(n: number): string {
    return n.toFixed(2).replace(".", ",");
}
