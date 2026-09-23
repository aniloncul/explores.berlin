import { NextResponse } from "next/server";
import { query } from "@/lib/db";

type CachedCover = {
    mime: string;
    bytes: Buffer;
    byteSize: number;
    etag: string;
    lastModified: string;
};

// Per-instance LRU so warm lambdas skip PG for repeated card images.
const CACHE_MAX = 80;
const coverCache = new Map<string, CachedCover>();

function cacheGet(slug: string): CachedCover | undefined {
    const hit = coverCache.get(slug);
    if (!hit) return undefined;
    // refresh LRU order
    coverCache.delete(slug);
    coverCache.set(slug, hit);
    return hit;
}

function cacheSet(slug: string, value: CachedCover) {
    if (coverCache.has(slug)) coverCache.delete(slug);
    coverCache.set(slug, value);
    while (coverCache.size > CACHE_MAX) {
        const oldest = coverCache.keys().next().value;
        if (oldest === undefined) break;
        coverCache.delete(oldest);
    }
}

async function fetchCover(slug: string): Promise<CachedCover | null> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await query(
                `SELECT mime, width, height, bytes, byte_size, updated_at
                 FROM place_covers
                 WHERE slug = $1`,
                [slug]
            );
            const row = res.rows[0];
            if (!row) return null;

            const bytes = Buffer.from(row.bytes);
            const updatedDate =
                row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);
            const byteSize = row.byte_size || bytes.length;
            const value: CachedCover = {
                mime: row.mime || "image/webp",
                bytes,
                byteSize,
                etag: `"${slug}-${updatedDate.getTime()}-${byteSize}"`,
                lastModified: updatedDate.toUTCString(),
            };
            cacheSet(slug, value);
            return value;
        } catch (e) {
            lastError = e;
            await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
        }
    }
    throw lastError;
}

// GET /api/places/cover/{slug} — stream compressed WebP cover from Postgres
export async function GET(
    req: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    if (!slug || !/^[a-z0-9_+-]+$/i.test(slug)) {
        return new NextResponse("Bad slug", { status: 400 });
    }

    try {
        let cover = cacheGet(slug);
        if (!cover) {
            cover = await fetchCover(slug);
        }
        if (!cover) {
            return new NextResponse("Not found", { status: 404 });
        }

        const ifNoneMatch = req.headers.get("if-none-match");
        if (ifNoneMatch && ifNoneMatch === cover.etag) {
            return new NextResponse(null, {
                status: 304,
                headers: {
                    ETag: cover.etag,
                    "Cache-Control": "public, max-age=31536000, immutable",
                },
            });
        }

        return new NextResponse(new Uint8Array(cover.bytes), {
            status: 200,
            headers: {
                "Content-Type": cover.mime,
                "Content-Length": String(cover.byteSize),
                ETag: cover.etag,
                "Cache-Control": "public, max-age=31536000, immutable",
                "Last-Modified": cover.lastModified,
            },
        });
    } catch (error: any) {
        console.error("Cover fetch error:", slug, error?.message || error);
        return new NextResponse("Failed to load cover", { status: 500 });
    }
}
