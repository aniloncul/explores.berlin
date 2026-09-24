#!/usr/bin/env node
/**
 * OCR pasted menu photos in ## Notes → structured ## Menu markdown tables.
 *
 * Usage:
 *   node scripts/vault/menus_from_images.js
 *   node scripts/vault/menus_from_images.js --dry-run
 *   node scripts/vault/menus_from_images.js --force
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const matter = require("gray-matter");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env.local") });

const VAULT = process.env.OBSIDIAN_VAULT_PATH;

function parseArgs(argv) {
    const args = { dryRun: false, force: false, help: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--dry-run") args.dryRun = true;
        else if (a === "--force") args.force = true;
        else if (a === "--help" || a === "-h") args.help = true;
    }
    return args;
}

function walkMd(dir, out = []) {
    for (const entry of fs.readdirSync(dir)) {
        if (entry.startsWith("_") || entry.startsWith(".")) continue;
        const full = path.join(dir, entry);
        let st;
        try {
            st = fs.statSync(full);
        } catch {
            continue;
        }
        if (st.isDirectory()) walkMd(full, out);
        else if (entry.endsWith(".md")) out.push(full);
    }
    return out;
}

function ocrImage(absPath) {
    try {
        const out = execFileSync(
            "tesseract",
            [absPath, "stdout", "-l", "deu+eng", "--psm", "6"],
            { encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 60000 }
        );
        return out || "";
    } catch (e) {
        console.warn(`  OCR fail ${path.basename(absPath)}: ${e.message}`);
        return "";
    }
}

/** Extract price number from a string (German/EU formats). */
function extractPrice(text) {
    if (!text) return null;
    // 8,00€ / 8.00 € / €8,00 / 8,00
    const m =
        text.match(/(\d{1,2})[.,](\d{2})\s*€/) ||
        text.match(/€\s*(\d{1,2})[.,](\d{2})/) ||
        text.match(/(\d{1,2})[.,](\d{2})(?![\d])/);
    if (m) {
        const n = Number(`${m[1]}.${m[2]}`);
        if (Number.isFinite(n) && n > 0 && n < 200) return n;
    }
    // bare 6.09 / 6,09 without decimals requirement already handled; try 1-2 digit int with euro nearby
    const m2 = text.match(/(\d{1,2})[.,](\d{1})(?![\d])/);
    if (m2) {
        const n = Number(`${m2[1]}.${m2[2]}0`);
        if (Number.isFinite(n) && n > 0.5 && n < 200) return n;
    }
    return null;
}

function isDonerish(name) {
    const s = String(name || "").toLowerCase();
    return /d[öo]ner|doner|kebap|kebab|d[üu]r[üu]m|dürüm|pide|lahmacun|adana|ayrint/.test(s);
}

function cleanItemName(line) {
    let s = line
        .replace(/^\s*\d{1,2}\s*[.)-]\s*/, "")
        .replace(/^\s*[VY|›>•·oO0Il]+\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
    s = s.replace(/\s*€?\s*\d{1,2}[.,]\d{2}\s*€?\s*$/, "");
    s = s.replace(/\s*€\s*$/, "");
    s = s.replace(/\s{2,}/g, " ").trim();
    s = s.replace(/[.\s]{2,}$/g, "").trim();
    if (!s || s.length < 4) return null;
    if (/^[\d.,€\s|]+$/.test(s)) return null;
    const letters = s.match(/[A-Za-zÄÖÜäöüß]/g);
    if (!letters || letters.length < 4) return null;
    if (/^(ab\s*)+$/i.test(s)) return null;
    if (/^(mit|und|oder|extra|sides|extras|produktinfo|information|ab|sauce|salat|fleisch|getränk|eine|einen|ohne|mit|und)$/i.test(s)) return null;
    if (/^[\s|_.,;:()-]+$/.test(s)) return null;
    const junk = (s.match(/[^A-Za-zÄÖÜäöüß0-9 .,€'’()+/-]/g) || []).length;
    if (junk > s.length * 0.25) return null;
    // reject mostly-consonant OCR noise
    const cons = s.match(/[bcdfghjklmnpqrstvwxzBCDFGHJKLMNPQRSTVWXZ]/g) || [];
    const vow = s.match(/[aeiouyäöüAEIOUYÄÖÜ]/g) || [];
    if (cons.length >= 6 && vow.length < 2) return null;
    return s;
}

function isUsablePrice(n) {
    return Number.isFinite(n) && n >= 1.5 && n <= 40;
}

/** Parse OCR text → [{name, price}] sorted by price. */
function parseMenuItems(ocrText) {
    const lines = String(ocrText || "")
        .split(/\r?\n/)
        .map((l) => l.replace(/\t/g, " ").trim())
        .filter(Boolean);

    const items = [];
    const seen = new Set();

    for (const line of lines) {
        // Prefer lines that contain an explicit € price
        const hasEuro = /€/.test(line);
        const price = extractPrice(line);
        if (price == null) continue;
        if (!isUsablePrice(price)) continue;

        // Prefer explicit € lines; allow non-euro only if name looks like food
        const priceMatch =
            line.match(/(\d{1,2}[.,]\d{2})\s*€/) ||
            line.match(/€\s*(\d{1,2}[.,]\d{2})/) ||
            line.match(/(\d{1,2}[.,]\d{2})/);
        let rawName = line;
        if (priceMatch && priceMatch.index != null) {
            rawName = line.slice(0, priceMatch.index);
        }
        let name = cleanItemName(rawName);
        if (!name && hasEuro) {
            name = cleanItemName(line.replace(/€?\s*\d{1,2}[.,]\d{2}\s*€?/g, " "));
        }
        if (!name) continue;
        if (name.length > 80) name = name.slice(0, 80).trim();
        if (!hasEuro && !isDonerish(name) && name.replace(/[^A-Za-zÄÖÜäöüß]/g, "").length < 6) {
            continue;
        }

        const key = `${name.toLowerCase()}|${price}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ name, price, explicitEuro: hasEuro });
    }

    // Stable: keep explicit-euro first, then price ascending
    items.sort((a, b) => Number(b.explicitEuro) - Number(a.explicitEuro) || a.price - b.price || a.name.localeCompare(b.name));
    return items.map(({ name, price }) => ({ name, price }));
}

function lowestDonerPrice(items) {
    const doner = items.filter((i) => isDonerish(i.name) && isUsablePrice(i.price));
    const pool = doner.length ? doner : items.filter((i) => isUsablePrice(i.price));
    if (!pool.length) return null;
    return Math.min(...pool.map((i) => i.price));
}

function formatPrice(n) {
    return n.toFixed(2).replace(".", ",");
}

function buildMenuMarkdown(items) {
    if (!items.length) return null;
    const rows = items
        .map((i) => `| ${escapeCell(i.name)} | ${formatPrice(i.price)} € |`)
        .join("\n");
    return `| Item | Price |\n|------|-------|\n${rows}`;
}

function escapeCell(s) {
    return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function insertMenuSection(content, menuMd) {
    const block = `## Menu\n\n${menuMd}\n`;
    if (/^## Menu\b/m.test(content)) {
        return content.replace(/^## Menu\b[\s\S]*?(?=^## |$)/m, block + "\n");
    }
    // Insert before ## Notes if present, else append
    if (/^## Notes\b/m.test(content)) {
        return content.replace(/^## Notes\b/m, block + "\n## Notes");
    }
    return content.trimEnd() + `\n\n${block}`;
}

function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        console.log("Usage: node scripts/vault/menus_from_images.js [--dry-run] [--force]");
        process.exit(0);
    }
    if (!VAULT || !fs.existsSync(VAULT)) {
        console.error("OBSIDIAN_VAULT_PATH missing");
        process.exit(1);
    }

    const notes = walkMd(path.join(VAULT, "places"));
    const stats = {
        scanned: notes.length,
        withImage: 0,
        alreadyHasMenu: 0,
        ocrEmpty: 0,
        noItems: 0,
        updated: 0,
        withPrice: 0,
        errors: 0,
    };

    const report = [];

    for (const file of notes) {
        let raw;
        try {
            raw = fs.readFileSync(file, "utf8");
        } catch {
            continue;
        }
        if (!raw.includes("Pasted image") && !raw.includes("![[Pasted")) continue;

        const parsed = matter(raw);
        const imgMatch = parsed.content.match(/!\[\[(Pasted image[^\]]+)\]\]/);
        if (!imgMatch) continue;
        stats.withImage++;

        if (!args.force && /^## Menu\b/m.test(parsed.content)) {
            stats.alreadyHasMenu++;
            continue;
        }

        const imgPath = path.join(VAULT, imgMatch[1].trim());
        if (!fs.existsSync(imgPath)) {
            console.warn(`  missing image for ${file}: ${imgMatch[1]}`);
            stats.errors++;
            continue;
        }

        try {
            const ocr = ocrImage(imgPath);
            if (!ocr.trim()) {
                stats.ocrEmpty++;
                continue;
            }
            const items = parseMenuItems(ocr);
            // require at least one usable item with a somewhat clean name
            const good = items.filter((i) => i.name.replace(/[^A-Za-zÄÖÜäöüß]/g, "").length >= 4);
            if (!good.length) {
                stats.noItems++;
                report.push({
                    file: path.relative(VAULT, file),
                    status: "no_items",
                    ocrSample: ocr.slice(0, 200),
                });
                continue;
            }

            const menuMd = buildMenuMarkdown(good);
            const low = lowestDonerPrice(good);
            if (low != null) stats.withPrice++;

            if (args.dryRun) {
                console.log(`\n--- ${path.basename(file)} (${good.length} items, low=${low}) ---`);
                console.log(menuMd);
                continue;
            }

            const newContent = insertMenuSection(parsed.content, menuMd);
            const rebuilt = matter.stringify(newContent, parsed.data, {
                quotingType: '"',
                forceQuotes: false,
            });
            fs.writeFileSync(file, rebuilt, "utf8");
            stats.updated++;
            report.push({
                file: path.relative(VAULT, file),
                status: "ok",
                items: good.length,
                lowest: low,
                lowestDoner: good.filter((i) => isDonerish(i.name)).length
                    ? Math.min(...good.filter((i) => isDonerish(i.name)).map((i) => i.price))
                    : null,
            });

            if (stats.updated % 10 === 0) {
                console.log(`  ${stats.updated} updated (last ${path.basename(file)}, ${good.length} items)`);
            }
        } catch (e) {
            stats.errors++;
            console.error(`  fail ${file}: ${e.message}`);
        }
    }

    const reportPath = path.join(VAULT, "places", "menus-from-images-report.json");
    fs.writeFileSync(
        reportPath,
        JSON.stringify({ updated: new Date().toISOString(), ...stats, report }, null, 2),
        "utf8"
    );

    console.log(`
Done${args.dryRun ? " (dry-run)" : ""}.
  scanned:         ${stats.scanned}
  with image:      ${stats.withImage}
  already has Menu:${stats.alreadyHasMenu}
  ocr empty:       ${stats.ocrEmpty}
  no price items:  ${stats.noItems}
  notes updated:   ${stats.updated}
  with lowest:     ${stats.withPrice}
  errors:          ${stats.errors}
  report:          ${reportPath}
`);
}

main();
