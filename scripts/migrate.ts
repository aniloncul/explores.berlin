import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";
import { mockLocations } from "../data/mockLocations";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error("DATABASE_URL is not set in environment variables!");
    process.exit(1);
} else {
    console.log("Database URL is set. Connection string (masked):", databaseUrl.replace(/:[^:@]+@/, ":***@"));
}

const tableSchema = `
CREATE TABLE IF NOT EXISTS locations (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category TEXT[] DEFAULT '{}',
    description TEXT NOT NULL,
    address TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    images TEXT[] DEFAULT '{}',
    highlight BOOLEAN DEFAULT FALSE,
    main_category VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    detail TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

async function migrate() {
    console.log("Connecting to PostgreSQL database...");
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const userRes = await client.query("SELECT current_user, current_database()");
    console.log("Connected as:", userRes.rows[0]);

    try {
        console.log("Creating 'locations' table if it doesn't exist...");
        await client.query(tableSchema);
        console.log("Table 'locations' is ready.");

        console.log(`Starting migration of ${mockLocations.length} locations...`);

        for (const loc of mockLocations) {
            // Check if location already exists
            const checkRes = await client.query("SELECT id FROM locations WHERE id = $1", [loc.id]);
            if (checkRes.rows.length > 0) {
                console.log(`Location '${loc.title}' (ID: ${loc.id}) already exists. Skipping.`);
                continue;
            }

            // Fallback for empty dates to prevent PG timestamp errors
            const startDate = loc.startDate ? new Date(loc.startDate).toISOString() : new Date().toISOString();
            const endDate = loc.endDate ? new Date(loc.endDate).toISOString() : new Date().toISOString();

            const queryText = `
                INSERT INTO locations (
                    id, title, category, description, address, lat, lng, start_date, end_date, images, highlight, main_category, tags, detail
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
                )
            `;

            const values = [
                loc.id,
                loc.title,
                loc.category || [],
                loc.description,
                loc.address,
                loc.coordinates.lat,
                loc.coordinates.lng,
                startDate,
                endDate,
                loc.images || [],
                loc.highlight || false,
                loc.mainCategory || null,
                loc.tags || [],
                loc.detail || null
            ];

            await client.query(queryText, values);
            console.log(`Successfully migrated: ${loc.title}`);
        }

        console.log("Migration completed successfully!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

migrate();
