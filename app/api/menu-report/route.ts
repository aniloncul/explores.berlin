import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB per photo
const MAX_IMAGES = 10;
const MAX_MESSAGE = 4000;

type ReportImage = { name: string; mime: string; bytes: Buffer };

function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

async function notifyByTelegram(opts: {
    reportId: number | null;
    placeTitle: string;
    placeSlug: string;
    message: string;
    email: string;
    images: ReportImage[];
}): Promise<{ ok: boolean; error?: string }> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        console.error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing — telegram notify skipped");
        return { ok: false, error: "telegram env missing" };
    }
    const api = `https://api.telegram.org/bot${token}`;

    const header =
        `🍴 <b>Menu fix report` +
        (opts.reportId ? ` #${opts.reportId}` : ``) +
        `</b>\n` +
        `<b>Place:</b> ${escapeHtml(opts.placeTitle || "—")}\n` +
        `<b>Slug:</b> ${escapeHtml(opts.placeSlug || "—")}\n` +
        `<b>Reporter:</b> ${escapeHtml(opts.email || "anonymous")}\n`;
    const body = opts.message
        ? `\n${escapeHtml(opts.message.slice(0, 3000))}`
        : `\n<i>(no message — photo only)</i>`;
    const text = (header + body).slice(0, 4000);

    // With photos: album (sendMediaGroup) for 2+, single sendPhoto otherwise.
    // Caption max ~1024 chars on the first item.
    if (opts.images.length) {
        const caption = (header + body).slice(0, 1000);
        const sendOne = async (img: ReportImage, cap: string): Promise<boolean> => {
            const fd = new FormData();
            fd.append("chat_id", chatId);
            fd.append("photo", new Blob([new Uint8Array(img.bytes)], { type: img.mime || "image/jpeg" }), img.name || "menu.jpg");
            fd.append("caption", cap);
            fd.append("parse_mode", "HTML");
            const res = await fetch(`${api}/sendPhoto`, { method: "POST", body: fd });
            if (res.ok) return true;
            console.error("Telegram sendPhoto error:", (await res.text().catch(() => "")).slice(0, 200));
            // Fallback: document (accepts HEIC & anything sendPhoto rejects)
            const fd2 = new FormData();
            fd2.append("chat_id", chatId);
            fd2.append("document", new Blob([new Uint8Array(img.bytes)], { type: img.mime || "application/octet-stream" }), img.name || "menu.jpg");
            fd2.append("caption", cap);
            fd2.append("parse_mode", "HTML");
            const res2 = await fetch(`${api}/sendDocument`, { method: "POST", body: fd2 });
            if (!res2.ok) {
                console.error("Telegram sendDocument error:", (await res2.text().catch(() => "")).slice(0, 200));
                return false;
            }
            return true;
        };

        if (opts.images.length === 1) {
            if (!(await sendOne(opts.images[0], caption))) {
                return { ok: false, error: "telegram send failed" };
            }
        } else {
            // Album: one multipart call, caption on first photo
            const fd = new FormData();
            fd.append("chat_id", chatId);
            const media = opts.images.map((img, i) => ({
                type: "photo",
                media: `attach://p${i}`,
                ...(i === 0 ? { caption, parse_mode: "HTML" } : {}),
            }));
            fd.append("media", JSON.stringify(media));
            opts.images.forEach((img, i) => {
                fd.append(`p${i}`, new Blob([new Uint8Array(img.bytes)], { type: img.mime || "image/jpeg" }), img.name || `menu${i + 1}.jpg`);
            });
            const res = await fetch(`${api}/sendMediaGroup`, { method: "POST", body: fd });
            if (!res.ok) {
                console.error("Telegram sendMediaGroup error:", (await res.text().catch(() => "")).slice(0, 300));
                // Fallback: photos one by one (photo→document fallback inside)
                for (let i = 0; i < opts.images.length; i++) {
                    if (!(await sendOne(opts.images[i], i === 0 ? caption : ""))) {
                        return { ok: false, error: "telegram album fallback failed" };
                    }
                }
            }
        }
        // Full text didn't fit in caption → send remainder as message
        if (text.length > caption.length) {
            await fetch(`${api}/sendMessage`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text.slice(caption.length) || text,
                    parse_mode: "HTML",
                }),
            });
        }
        return { ok: true };
    }

    const res = await fetch(`${api}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
        const err = await res.text().catch(() => "");
        console.error("Telegram sendMessage error:", err.slice(0, 300));
        return { ok: false, error: `telegram ${res.status}` };
    }
    return { ok: true };
}

function ensureSchema() {
    return query(`
        CREATE TABLE IF NOT EXISTS menu_reports (
            id SERIAL PRIMARY KEY,
            place_slug VARCHAR(255),
            place_title VARCHAR(255),
            message TEXT,
            email VARCHAR(255),
            image_mime VARCHAR(100),
            image_bytes BYTEA,
            image_name VARCHAR(255),
            status VARCHAR(50) DEFAULT 'new',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            suggested_menu_md TEXT,
            processed_at TIMESTAMPTZ,
            processing_error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_menu_reports_created ON menu_reports(created_at DESC);
        ALTER TABLE menu_reports ADD COLUMN IF NOT EXISTS suggested_menu_md TEXT;
        ALTER TABLE menu_reports ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
        ALTER TABLE menu_reports ADD COLUMN IF NOT EXISTS processing_error TEXT;
        CREATE TABLE IF NOT EXISTS menu_report_images (
            id SERIAL PRIMARY KEY,
            report_id INTEGER NOT NULL REFERENCES menu_reports(id) ON DELETE CASCADE,
            position INTEGER NOT NULL DEFAULT 0,
            image_mime VARCHAR(100),
            image_bytes BYTEA,
            image_name VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_menu_report_images_report ON menu_report_images(report_id);
        ALTER TABLE menu_report_images ADD COLUMN IF NOT EXISTS sha256 VARCHAR(64);
    `);
}

export async function POST(req: Request) {
    try {
        const contentType = req.headers.get("content-type") || "";

        let placeSlug = "";
        let placeTitle = "";
        let message = "";
        let email = "";
        const images: ReportImage[] = [];

        if (contentType.includes("multipart/form-data")) {
            const form = await req.formData();
            placeSlug = String(form.get("placeSlug") || "").slice(0, 255);
            placeTitle = String(form.get("placeTitle") || "").slice(0, 255);
            message = String(form.get("message") || "").slice(0, MAX_MESSAGE);
            email = String(form.get("email") || "").slice(0, 255);

            const files = form.getAll("image").filter(
                (f): f is File => typeof f === "object" && f !== null && "size" in f && (f as File).size > 0
            );
            if (files.length > MAX_IMAGES) {
                return NextResponse.json(
                    { error: `Too many photos (max ${MAX_IMAGES})` },
                    { status: 400 }
                );
            }
            for (const f of files) {
                if (f.size > MAX_IMAGE_BYTES) {
                    return NextResponse.json(
                        { error: `Photo ${f.name || ""} too large (max 8MB each)` },
                        { status: 400 }
                    );
                }
                let buf: Buffer = Buffer.from(await f.arrayBuffer());
                let mime = f.type || "image/jpeg";
                let name = (f.name || "menu.jpg").slice(0, 255);

                // iPhone HEIC → JPEG (Telegram sendPhoto HEIC kabul etmez)
                if (/heic|heif/i.test(mime) || /\.hei[c|f]$/i.test(name)) {
                    try {
                        const sharp = (await import("sharp")).default;
                        buf = Buffer.from(await sharp(buf).jpeg({ quality: 85 }).toBuffer());
                        mime = "image/jpeg";
                        name = name.replace(/\.hei[c|f]$/i, ".jpg");
                    } catch (e: any) {
                        console.error("HEIC convert failed, storing original:", e?.message);
                    }
                }
                images.push({ name, mime, bytes: buf });
            }
        } else {
            const body = await req.json();
            placeSlug = String(body.placeSlug || "").slice(0, 255);
            placeTitle = String(body.placeTitle || "").slice(0, 255);
            message = String(body.message || "").slice(0, MAX_MESSAGE);
            email = String(body.email || "").slice(0, 255);
        }

        const hasMessage = message.trim().length > 0;
        const hasImage = images.length > 0;

        if (!hasMessage && !hasImage) {
            return NextResponse.json(
                { error: "Provide menu photo(s) or a message" },
                { status: 400 }
            );
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json(
                { error: "Invalid email" },
                { status: 400 }
            );
        }

        await ensureSchema();

        const first = images[0] || null;
        const insertRes = await query(
            `INSERT INTO menu_reports
                (place_slug, place_title, message, email, image_mime, image_bytes, image_name)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING id`,
            [
                placeSlug || null,
                placeTitle || null,
                hasMessage ? message.trim() : null,
                email || null,
                first?.mime || null,
                first?.bytes || null,
                first?.name || null,
            ]
        );
        const reportId = insertRes.rows[0]?.id;
        const { createHash } = await import("crypto");
        let duplicatesSkipped = 0;
        for (let i = 0; i < images.length; i++) {
            const sha = createHash("sha256").update(images[i].bytes).digest("hex");
            const dupe = await query(
                "SELECT id FROM menu_report_images WHERE report_id=$1 AND sha256=$2 LIMIT 1",
                [reportId, sha]
            );
            if (dupe.rowCount) {
                duplicatesSkipped++;
                continue;
            }
            await query(
                `INSERT INTO menu_report_images (report_id, position, image_mime, image_bytes, image_name, sha256)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [reportId, i, images[i].mime, images[i].bytes, images[i].name, sha]
            );
        }
        // Legacy first-photo columns reflect the first STORED photo
        const firstStored = await query(
            "SELECT image_mime, image_bytes, image_name FROM menu_report_images WHERE report_id=$1 ORDER BY position LIMIT 1",
            [reportId]
        );
        if (firstStored.rowCount) {
            const f = firstStored.rows[0];
            await query(
                "UPDATE menu_reports SET image_mime=$1, image_bytes=$2, image_name=$3 WHERE id=$4",
                [f.image_mime, f.image_bytes, f.image_name, reportId]
            );
        } else {
            await query(
                "UPDATE menu_reports SET image_mime=NULL, image_bytes=NULL, image_name=NULL WHERE id=$1",
                [reportId]
            );
        }

        // Telegram notify — non-blocking for UX: report is already stored.
        // Uses stored (deduped) photos, not the raw upload.
        let telegramSent = false;
        let tgImages: ReportImage[] = [];
        try {
            const stored = await query(
                "SELECT image_mime AS mime, image_bytes AS bytes, image_name AS name FROM menu_report_images WHERE report_id=$1 ORDER BY position",
                [reportId]
            );
            tgImages = stored.rows.map((r: any) => ({
                mime: r.mime,
                bytes: Buffer.from(r.bytes),
                name: r.name,
            }));
            const tg = await notifyByTelegram({
                reportId: reportId ?? null,
                placeTitle,
                placeSlug,
                message: (hasMessage ? message.trim() : "") + (duplicatesSkipped ? `\n(${duplicatesSkipped} duplicate photo(s) skipped)` : ""),
                email,
                images: tgImages,
            });
            telegramSent = tg.ok;
            if (!tg.ok) {
                console.error("Menu report stored but telegram failed:", tg.error, "id=", reportId);
            }
        } catch (e: any) {
            console.error("Menu report telegram exception:", e?.message, "id=", reportId);
        }

        return NextResponse.json(
            {
                success: true,
                message: "Menu fix report received",
                id: reportId,
                telegramSent,
                imageCount: tgImages.length,
                duplicatesSkipped,
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error("Menu report error:", error);
        return NextResponse.json(
            { error: "Failed to submit menu report", details: error.message },
            { status: 500 }
        );
    }
}

export async function GET() {
    try {
        await ensureSchema();
        const res = await query(`
            SELECT
                m.id, m.place_slug, m.place_title, m.message, m.email,
                m.image_mime,
                octet_length(m.image_bytes) AS image_size,
                m.image_name, m.status, m.created_at,
                (SELECT COUNT(*) FROM menu_report_images i WHERE i.report_id = m.id) AS image_count
            FROM menu_reports m
            ORDER BY m.created_at DESC
            LIMIT 100
        `);
        return NextResponse.json(res.rows);
    } catch (error: any) {
        console.error("Menu reports fetch error:", error);
        return NextResponse.json(
            { error: "Failed to fetch menu reports", details: error.message },
            { status: 500 }
        );
    }
}
