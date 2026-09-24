import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_MESSAGE = 4000;
const REPORT_TO = process.env.MENU_REPORT_TO || "contact@explores-berlin.com";

function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function notifyByEmail(opts: {
    placeTitle: string;
    placeSlug: string;
    message: string;
    email: string;
    imageName: string;
    imageMime: string;
    imageBytes: Buffer | null;
}): Promise<{ ok: boolean; error?: string }> {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
        console.error("BREVO_API_KEY is not defined — menu report email skipped");
        return { ok: false, error: "BREVO_API_KEY missing" };
    }

    const subject = `Menu fix report${opts.placeTitle ? `: ${opts.placeTitle}` : ""}`;
    const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
          <h2 style="margin:0 0 12px">Menu fix report</h2>
          <table style="border-collapse:collapse">
            <tr><td style="padding:4px 8px;font-weight:bold">Place</td><td style="padding:4px 8px">${escapeHtml(opts.placeTitle || "—")}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:bold">Slug</td><td style="padding:4px 8px">${escapeHtml(opts.placeSlug || "—")}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:bold">Reporter</td><td style="padding:4px 8px">${escapeHtml(opts.email || "anonymous")}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:bold">Photo</td><td style="padding:4px 8px">${opts.imageBytes ? escapeHtml(opts.imageName || "menu.jpg") + " (attached)" : "none"}</td></tr>
          </table>
          <p style="margin:16px 0 4px;font-weight:bold">Message</p>
          <p style="margin:0;white-space:pre-wrap">${escapeHtml(opts.message || "(no message — photo only)")}</p>
        </div>
    `;

    const payload: any = {
        to: [{ email: REPORT_TO }],
        subject,
        htmlContent: html,
    };
    if (opts.email) {
        payload.replyTo = { email: opts.email };
    }
    if (opts.imageBytes && opts.imageBytes.length) {
        // Brevo attachment content must be base64
        payload.attachment = [
            {
                name: (opts.imageName || "menu.jpg").replace(/[^\w.\-]+/g, "_").slice(0, 80),
                content: opts.imageBytes.toString("base64"),
            },
        ];
    }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            accept: "application/json",
            "api-key": apiKey,
            "content-type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Brevo menu report email error:", err);
        return { ok: false, error: err.message || `Brevo ${res.status}` };
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

        // Email notify — non-blocking for UX: report is already stored
        let emailSent = false;
        try {
            const mail = await notifyByEmail({
                placeTitle,
                placeSlug,
                message: hasMessage ? message.trim() : "",
                email,
                imageName,
                imageMime,
                imageBytes,
            });
            emailSent = mail.ok;
            if (!mail.ok) {
                console.error("Menu report stored but email failed:", mail.error, "id=", reportId);
            }
        } catch (e: any) {
            console.error("Menu report email exception:", e?.message, "id=", reportId);
        }

        return NextResponse.json(
            {
                success: true,
                message: "Menu fix report received",
                id: reportId,
                emailSent,
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
