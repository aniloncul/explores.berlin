import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Vercel Cron fallback: processes reports the Mac poller hasn't claimed.
// Age gate (2h) avoids racing the Mac (it polls every 5 min when on).
// Skips HEIC (needs Mac sips) — those wait for the Mac. One report per run
// to fit serverless timeouts. Vercel sends Authorization: Bearer CRON_SECRET.
export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_PROMPT = `Transcribe this restaurant menu image into a markdown table.

| Item | Price |
|------|-------|

Rules:
- One row per dish or drink that shows a price, in the original menu order.
- EVERY size variant gets its own row: if a beer lists 0,3L, 0,4L and 0,5L
  prices, emit three rows like "Pilsner (0,3L)", "Pilsner (0,4L)",
  "Pilsner (0,5L)" — never collapse sizes into one row.
- If a cocktail or dish lists ingredients, append them in parentheses after
  the name, e.g. "Gin Basil (Tanqueray Dry Gin, Zuckersirup, Zitronensaft)".
  Keep them short: drop allergen codes and additive numbers.
- Price format: German, e.g. 8,50 € (comma decimal, space before €).
- The price is the RIGHTMOST amount on the line (often written "-- 12,50").
  Volumes like 0,33L, 0,5L, 0,75L, 1L are NOT prices — never output a volume
  as a price. If you cannot find a real price for an item, write ?.
- Keep item names in the language printed on the menu.
- Drop allergen superscripts, portion codes, "Produktinfo", logos, QR codes,
  addresses and opening hours.
- NEVER output section/category headers (COCKTAILS, BEER, WINE, SOFT DRINKS…)
  as rows — headers are not dishes, skip them entirely.
- Never use bold (**) or any other markdown formatting inside the table.
- Output the table directly with no analysis.
- Output only the markdown table. No commentary, no code fences.`;

function escapeHtml(s: string) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Separator-row check, built dynamically (Tailwind scans .ts sources and
// chokes on arbitrary-value-looking patterns, so no such literal here).
const SEP_RE = new RegExp("^[\\-:\\s]+$");
function isSepRow(s: string): boolean {
    return SEP_RE.test(s);
}

async function tgSend(text: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chat = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chat) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), parse_mode: "HTML" }),
    });
}

function cleanTable(raw: string): string | null {
    const text = String(raw || "").replace(/```/g, "");
    const lines = text.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim().startsWith("|"));
    if (lines.length < 3) return null;
    const norm = (p: string): string | null => {
        p = p.replace(/\s+/g, " ").trim();
        if (p === "?" || p === "") return "?";
        let m = p.match(/^€\s*(\d{1,3}),(\d{1,2})$/);
        if (m) return `${m[1]},${m[2].padEnd(2, "0")} €`;
        m = p.match(/^(ab\s+)?(\d{1,3})[,.](\d{2})\s*€$/);
        if (m) return `${m[1] || ""}${m[2]},${m[3]} €`;
        m = p.match(/^(\d{1,3})\s*€$/);
        if (m) return `${m[1]},00 €`;
        return null;
    };
    let rows: string[] = [];
    const seen = new Set<string>();
    for (const ln of lines) {
        if (ln.includes("**")) continue;
        const cells = ln.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (cells.length < 2) continue;
        const [item, price] = cells;
        if (isSepRow(item) || isSepRow(price)) continue;
        if (item.toLowerCase() === "item" && price.toLowerCase() === "price") {
            rows = ["| Item | Price |", "|------|-------|"];
            continue;
        }
        const n = norm(price);
        if (n === null) continue;
        const cleanItem = item.replace(/\s+/g, " ").trim();
        if (!cleanItem) continue;
        const key = `| ${cleanItem} | ${n} |`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(`| ${cleanItem} | ${n} |`);
    }
    if (rows.length < 3) return null;
    return rows.join("\n");
}

export async function GET(req: Request) {
    const auth = req.headers.get("authorization") || "";
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    try {
        // Claim one stale report (older than 2h, not HEIC)
        const claim = await query(
            `UPDATE menu_reports SET status='processing', updated_at=NOW()
             WHERE id = (
               SELECT id FROM menu_reports
               WHERE status='new' AND created_at < NOW() - INTERVAL '2 hours'
                 AND (image_bytes IS NULL
                      OR (COALESCE(image_mime,'') NOT ILIKE '%heic%'
                          AND COALESCE(image_mime,'') NOT ILIKE '%heif%'
                          AND COALESCE(image_name,'') NOT ILIKE '%.hei%'))
               ORDER BY id LIMIT 1
             )
             RETURNING id, place_slug, place_title, message`
        );
        if (!claim.rowCount) return NextResponse.json({ ok: true, processed: 0 });

        const r = claim.rows[0] as any;
        let raws: { image_mime: string; image_bytes: Buffer; image_name: string }[] = [];
        try {
            const imgs = await query(
                "SELECT image_mime, image_bytes, image_name FROM menu_report_images WHERE report_id=$1 ORDER BY position",
                [r.id]
            );
            raws = imgs.rows.filter((x: any) => x.image_bytes && (x.image_bytes as Buffer).length > 0);
        } catch { /* side table may not exist yet */ }
        if (!raws.length) {
            const legacy = await query("SELECT image_mime, image_bytes, image_name FROM menu_reports WHERE id=$1", [r.id]);
            const l = legacy.rows[0];
            if (l?.image_bytes && (l.image_bytes as Buffer).length > 0) raws = [l];
        }
        const hasImage = raws.length > 0;

        if (!hasImage) {
            await query("UPDATE menu_reports SET status='text-only', processed_at=NOW() WHERE id=$1", [r.id]);
            await tgSend(
                `📝 <b>Menu report #${r.id} — text only, no photo</b>\n` +
                `<b>Place:</b> ${escapeHtml(r.place_title || "—")}\n` +
                `<b>Message:</b> ${escapeHtml(r.message || "—")}`
            );
            return NextResponse.json({ ok: true, processed: 1, kind: "text-only", id: r.id });
        }

        // Normalize orientation via sharp (EXIF transpose). HEIC already excluded.
        // Multi-page: all photos go in one call, model merges into one table.
        const blocks: any[] = [{ type: "text", text: BASE_PROMPT + (raws.length > 1 ? `\n\nThe attached ${raws.length} photos are pages of the SAME menu, in order. Merge them into ONE combined table.` : "") }];
        for (const im of raws) {
            let imgBuf: Buffer = Buffer.from(im.image_bytes);
            try {
                const sharp = (await import("sharp")).default;
                imgBuf = Buffer.from(await sharp(imgBuf).rotate().jpeg({ quality: 90 }).toBuffer());
            } catch { /* send as-is */ }
            blocks.push({ type: "image_url", image_url: { url: "data:image/jpeg;base64," + imgBuf.toString("base64") } });
        }

        const apiKey = process.env.NVIDIA_API_KEY;
        if (!apiKey) throw new Error("NVIDIA_API_KEY missing");
        const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: process.env.VLM_CLOUD_MODEL || "nvidia/ising-calibration-1.5-31b",
                messages: [{
                    role: "user",
                    content: blocks,
                }],
                temperature: 0,
                max_tokens: 3000,
            }),
            signal: AbortSignal.timeout(55_000),
        });
        if (!res.ok) throw new Error(`nvidia ${res.status}`);
        const data = await res.json();
        const table = cleanTable(data.choices?.[0]?.message?.content || "");
        if (!table) throw new Error("no valid table in VLM reply");

        await query(
            `UPDATE menu_reports SET suggested_menu_md=$1, status='suggested',
             processed_at=NOW(), updated_at=NOW(), processing_error=NULL WHERE id=$2`,
            [table, r.id]
        );
        await tgSend(
            `🆕 <b>Suggested menu #${r.id}: ${escapeHtml(r.place_title || "?")}</b> (via cloud fallback)\n\n` +
            `<pre>${escapeHtml(table).slice(0, 3000)}</pre>`
        );
        return NextResponse.json({ ok: true, processed: 1, kind: "suggested", id: r.id });
    } catch (e: any) {
        console.error("cron process-reports:", e.message);
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
