import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/places/cover/{slug} — stream compressed WebP cover from Postgres
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    if (!slug || !/^[a-z0-9_+-]+$/i.test(slug)) {
        return new NextResponse("Bad slug", { status: 400 });
    }

    try {
        const res = await query(
            `SELECT mime, width, height, bytes, byte_size, updated_at
             FROM place_covers
             WHERE slug = $1`,
            [slug]
        );

        const row = res.rows[0];
        if (!row) {
            return new NextResponse("Not found", { status: 404 });
        }

        const buf = Buffer.from(row.bytes);
        const updatedMs = row.updated_at instanceof Date ? row.updated_at.getTime() : Date.now();
        const etag = `"${slug}-${updatedMs}-${row.byte_size}"`;

        return new NextResponse(new Uint8Array(buf), {
            status: 200,
            headers: {
                "Content-Type": row.mime || "image/webp",
                "Content-Length": String(row.byte_size || buf.length),
                ETag: etag,
                "Cache-Control": "public, max-age=31536000, immutable",
                "Last-Modified": new Date(row.updated_at).toUTCString(),
            },
        });
    } catch (error: any) {
        console.error("Cover fetch error:", error);
        return new NextResponse("Failed to load cover", { status: 500 });
    }
}
