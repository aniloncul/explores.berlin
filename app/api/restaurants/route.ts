import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { Location } from "@/types";
import { lowestDonerPrice } from "@/lib/menu";

function buildDescription(row: any): string {
    const parts: string[] = [];
    if (row.price_range) parts.push(row.price_range);
    if (row.neighborhood) {
        const n = String(row.neighborhood);
        parts.push(n.charAt(0).toUpperCase() + n.slice(1).replace(/-/g, " "));
    }
    const cuisines = Array.isArray(row.cuisine) ? row.cuisine : [];
    if (cuisines.length) parts.push(cuisines.join(", "));
    return parts.length ? parts.join(" · ") : "Restaurant in Berlin";
}

function buildDetail(row: any): string {
    const lines: string[] = [];
    if (row.website) lines.push(`Website: ${row.website}`);
    if (row.phone) lines.push(`Phone: ${row.phone}`);
    if (row.address) lines.push(`Address: ${row.address}`);
    if (row.price_range) lines.push(`Price: ${row.price_range}`);
    if (row.google_primary_type_display) lines.push(`Type: ${row.google_primary_type_display}`);
    const cuisines = Array.isArray(row.cuisine) ? row.cuisine : [];
    if (cuisines.length) lines.push(`Cuisine: ${cuisines.join(", ")}`);
    return lines.join("\n");
}

function cleanHours(hours: any): Record<string, string> | null {
    if (!hours || typeof hours !== "object") return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(hours)) {
        if (v == null || v === "") continue;
        out[k] = String(v);
    }
    return Object.keys(out).length ? out : null;
}

/** Disk photo paths 404 on Vercel (gitignored) — rewrite to cover API. */
function normalizeImages(row: any): string[] {
    const imgs = Array.isArray(row.images) ? row.images : [];
    if (!imgs.length) return [];
    const cover = `/api/places/cover/${row.slug}`;
    return imgs.map((img: any) => {
        if (typeof img === "string" && img.startsWith("/images/places/")) return cover;
        return img;
    });
}

function toLocation(row: any): Location {
    const subtype = row.google_primary_type || null;

    return {
        id: `rest-${row.slug}`,
        title: row.name,
        category: ["Restaurant"],
        description: buildDescription(row),
        address: row.address || "",
        coordinates: {
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng),
        },
        startDate: "",
        endDate: "",
        images: normalizeImages(row),
        highlight: false,
        mainCategory: "Restaurant",
        neighborhood: row.neighborhood || null,
        subtype,
        googlePrimaryType: subtype,
        tags: [
            row.neighborhood,
            row.price_range,
            row.google_primary_type_display || subtype,
            ...(Array.isArray(row.cuisine) ? row.cuisine : []),
            ...(Array.isArray(row.tags) ? row.tags : []),
        ].filter(Boolean),
        detail: buildDetail(row),
        menuMd: row.menu_md || null,
        lowestPrice: lowestDonerPrice(row.menu_md),
        hours: cleanHours(row.hours),
        openingHoursRaw: row.opening_hours_raw || null,
    };
}

// GET: restaurants (type=restaurant), including all Döner/Kebab places
export async function GET() {
    try {
        const res = await query(`
            SELECT
                slug, name, type, neighborhood, address, lat, lng,
                price_range, website, phone, hours, opening_hours_raw,
                google_place_id, google_name, google_rating, google_user_ratings_total,
                google_types, google_primary_type, google_primary_type_display,
                tags, cuisine, menu_md, images
            FROM places
            WHERE type = 'restaurant'
              AND lat IS NOT NULL AND lng IS NOT NULL
              -- beer gardens already returned by /api/bars
              AND google_primary_type IS DISTINCT FROM 'beer_garden'
            ORDER BY name ASC
        `);

        const restaurants: Location[] = res.rows.map(toLocation);

        return NextResponse.json(restaurants);
    } catch (error: any) {
        console.error("Restaurants fetch error:", error);
        return NextResponse.json(
            { error: "Failed to fetch restaurants", details: error.message },
            { status: 500 }
        );
    }
}
