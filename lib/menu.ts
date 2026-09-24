export interface MenuItem {
    name: string;
    price: number;
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

/** Parse a simple markdown table (| Item | Price |) into rows. */
export function parseMenuMd(menuMd?: string | null): MenuItem[] {
    if (!menuMd) return [];
    const rows: MenuItem[] = [];
    for (const line of menuMd.split(/\r?\n/)) {
        const t = line.trim();
        if (!t.startsWith("|")) continue;
        const cells = t.split("|").map((c) => c.trim()).filter((c, i, arr) => !(i === 0 && c === "") && !(i === arr.length - 1 && c === ""));
        if (cells.length < 2) continue;
        if (/^[-\s:]+$/i.test(cells[0])) continue;
        if (/^item$/i.test(cells[0]) && /^price$/i.test(cells[1] || "")) continue;
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
