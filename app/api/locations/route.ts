import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { Location } from "@/types";

// GET: Fetch all locations from PostgreSQL
export async function GET() {
    try {
        const res = await query(`
            SELECT 
                id, title, category, description, address, lat, lng, 
                start_date as "startDate", end_date as "endDate", 
                images, highlight, main_category as "mainCategory", tags, detail
            FROM locations
            ORDER BY created_at DESC
        `);

        // Map PostgreSQL rows back to the frontend typed Location interface
        const locations: Location[] = res.rows.map((row: any) => ({
            id: row.id,
            title: row.title,
            category: row.category || [],
            description: row.description,
            address: row.address,
            coordinates: {
                lat: parseFloat(row.lat),
                lng: parseFloat(row.lng),
            },
            startDate: row.startDate ? new Date(row.startDate).toISOString() : "",
            endDate: row.endDate ? new Date(row.endDate).toISOString() : "",
            images: row.images || [],
            highlight: row.highlight || false,
            mainCategory: row.mainCategory || "",
            tags: row.tags || [],
            detail: row.detail || "",
        }));

        return NextResponse.json(locations);
    } catch (error: any) {
        console.error("Database fetch error:", error);
        return NextResponse.json(
            { error: "Failed to fetch locations", details: error.message },
            { status: 500 }
        );
    }
}

// POST: Add a new location to PostgreSQL
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            id,
            title,
            category,
            description,
            address,
            coordinates,
            startDate,
            endDate,
            images,
            highlight,
            mainCategory,
            tags,
            detail,
        } = body;

        if (!title || !description || !address || !coordinates?.lat || !coordinates?.lng) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const queryText = `
            INSERT INTO locations (
                id, title, category, description, address, lat, lng, 
                start_date, end_date, images, highlight, main_category, tags, detail
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            )
            RETURNING *
        `;

        const values = [
            id || `custom-event-${Date.now()}`,
            title,
            category || [],
            description,
            address,
            Number(coordinates.lat),
            Number(coordinates.lng),
            startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
            endDate ? new Date(endDate).toISOString() : new Date().toISOString(),
            images || [],
            highlight || false,
            mainCategory || null,
            tags || [],
            detail || null,
        ];

        await query(queryText, values);

        return NextResponse.json({ success: true, message: "Location added successfully" });
    } catch (error: any) {
        console.error("Database insert error:", error);
        return NextResponse.json(
            { error: "Failed to add location", details: error.message },
            { status: 500 }
        );
    }
}
