import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_MESSAGE = 4000;

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
    imageName: string;
    imageMime: string;
    imageBytes: Buffer | null;
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

    // With photo: sendPhoto (caption max ~1024 chars) + follow-up message if long
    if (opts.imageBytes && opts.imageBytes.length) {
        const caption = (header + body).slice(0, 1000);
        const fd = new FormData();
        fd.append("chat_id", chatId);
        fd.append(
            "photo",
            new Blob([new Uint8Array(opts.imageBytes)], {
                type: opts.imageMime || "image/jpeg",
            }),
            opts.imageName || "menu.jpg"
        );
        fd.append("caption", caption);
        fd.append("parse_mode", "HTML");
        const res = await fetch(`${api}/sendPhoto`, { method: "POST", body: fd });
        if (!res.ok) {
            const err = await res.text().catch(() => "");
            console.error("Telegram sendPhoto error:", err.slice(0, 300));
            // Fallback: send as document (accepts HEIC & anything sendPhoto rejects)
            const fd2 = new FormData();
            fd2.append("chat_id", chatId);
            fd2.append(
                "document",
                new Blob([new Uint8Array(opts.imageBytes)], {
                    type: opts.imageMime || "application/octet-stream",
                }),
                opts.imageName || "menu.jpg"
            );
            fd2.append("caption", caption);
            fd2.append("parse_mode", "HTML");
            const res2 = await fetch(`${api}/sendDocument`, { method: "POST", body: fd2 });
            if (!res2.ok) {
                const err2 = await res2.text().catch(() => "");
                console.error("Telegram sendDocument error:", err2.slice(0, 300));
                return { ok: false, error: `telegram ${res.status}/${res2.status}` };
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
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_menu_reports_created ON menu_reports(created_at DESC);
    `);
}

export async function POST(req: Request) {
    try {
        const contentType = req.headers.get("content-type") || "";

        let placeSlug = "";
        let placeTitle = "";
        let message = "";
        let email = "";
        let imageName = "";
        let imageMime = "";
        let imageBytes: Buffer | null = null;

        if (contentType.includes("multipart/form-data")) {
            const form = await req.formData();
            placeSlug = String(form.get("placeSlug") || "").slice(0, 255);
            placeTitle = String(form.get("placeTitle") || "").slice(0, 255);
            message = String(form.get("message") || "").slice(0, MAX_MESSAGE);
            email = String(form.get("email") || "").slice(0, 255);

            const file = form.get("image");
            if (file && typeof file === "object" && "size" in file && (file as File).size > 0) {
                const f = file as File;
                if (f.size > MAX_IMAGE_BYTES) {
                    return NextResponse.json(
                        { error: "Image too large (max 8MB)" },
                        { status: 400 }
                    );
                }
                const buf = Buffer.from(await f.arrayBuffer());
                imageMime = f.type || "image/jpeg";
                imageName = (f.name || "menu.jpg").slice(0, 255);
                imageBytes = buf;

                // iPhone HEIC → JPEG (Telegram sendPhoto HEIC kabul etmez)
                if (/heic|heif/i.test(imageMime) || /\.hei[c|f]$/i.test(imageName)) {
                    try {
                        const sharp = (await import("sharp")).default;
                        imageBytes = await sharp(buf).jpeg({ quality: 85 }).toBuffer();
                        imageMime = "image/jpeg";
                        imageName = imageName.replace(/\.hei[c|f]$/i, ".jpg");
                    } catch (e: any) {
                        console.error("HEIC convert failed, storing original:", e?.message);
                    }
                }
            }
        } else {
            const body = await req.json();
            placeSlug = String(body.placeSlug || "").slice(0, 255);
            placeTitle = String(body.placeTitle || "").slice(0, 255);
            message = String(body.message || "").slice(0, MAX_MESSAGE);
            email = String(body.email || "").slice(0, 255);
        }

        const hasMessage = message.trim().length > 0;
        const hasImage = !!imageBytes;

        if (!hasMessage && !hasImage) {
            return NextResponse.json(
                { error: "Provide a menu photo or a message" },
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
                imageMime || null,
                imageBytes,
                imageName || null,
            ]
        );
        const reportId = insertRes.rows[0]?.id;

        // Telegram notify — non-blocking for UX: report is already stored
        let telegramSent = false;
        try {
            const tg = await notifyByTelegram({
                reportId: reportId ?? null,
                placeTitle,
                placeSlug,
                message: hasMessage ? message.trim() : "",
                email,
                imageName,
                imageMime,
                imageBytes,
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
                id, place_slug, place_title, message, email,
                image_mime,
                octet_length(image_bytes) AS image_size,
                image_name, status, created_at
            FROM menu_reports
            ORDER BY created_at DESC
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
