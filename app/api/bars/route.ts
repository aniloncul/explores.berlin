import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { Location } from "@/types";

function buildDescription(row: any): string {
    const parts: string[] = [];
    if (row.price_range) parts.push(row.price_range);
    if (row.neighborhood) {
        const n = String(row.neighborhood);
        parts.push(n.charAt(0).toUpperCase() + n.slice(1).replace(/-/g, " "));
    }
    if (row.phone) parts.push(row.phone);
    return parts.length ? parts.join(" · ") : "Bar in Berlin";
}

function buildDetail(row: any): string {
    const lines: string[] = [];
    if (row.opening_hours_raw) lines.push(`Hours: ${row.opening_hours_raw}`);
    if (row.website) lines.push(`Website: ${row.website}`);
    if (row.phone) lines.push(`Phone: ${row.phone}`);
    if (row.address) lines.push(`Address: ${row.address}`);
    if (row.price_range) lines.push(`Price: ${row.price_range}`);
    if (row.google_primary_type_display) lines.push(`Type: ${row.google_primary_type_display}`);
    return lines.join("\n");
}

function toLocation(row: any): Location {
    const subtype = row.google_primary_type || null;
    return {
        id: `bar-${row.slug}`,
        title: row.name,
        category: ["Bar"],
        description: buildDescription(row),
        address: row.address || "",
        coordinates: {
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng),
        },
        startDate: "",
        endDate: "",
        images: [],
        highlight: false,
        mainCategory: "Bar",
        neighborhood: row.neighborhood || null,
        subtype,
        googlePrimaryType: subtype,
        tags: [
            row.neighborhood,
            row.price_range,
            row.google_primary_type_display || subtype,
            ...(Array.isArray(row.tags) ? row.tags : []),
        ].filter(Boolean),
        detail: buildDetail(row),
    };
}

// GET: bars (type=bar) + beer gardens (restaurant/cafe with primaryType=beer_garden)
export async function GET() {
    try {
        const res = await query(`
            SELECT
                slug, name, type, neighborhood, address, lat, lng,
                price_range, website, phone, hours, opening_hours_raw,
                google_place_id, google_name, google_rating, google_user_ratings_total,
                google_types, google_primary_type, google_primary_type_display,
                tags, cuisine, menu_md
            FROM places
            WHERE type = 'bar'
               OR (google_primary_type = 'beer_garden' AND type IN ('restaurant', 'cafe'))
            ORDER BY name ASC
        `);

        const bars: Location[] = res.rows.map(toLocation);

        return NextResponse.json(bars);
    } catch (error: any) {
        console.error("Bars fetch error:", error);
        return NextResponse.json(
            { error: "Failed to fetch bars", details: error.message },
            { status: 500 }
        );
    }
}
