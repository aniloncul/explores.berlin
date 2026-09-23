import { Pool } from "pg";

// Small pool: each Vercel instance should not open many conns to the VPS PG.
// Excess cover/list requests queue instead of exhausting max_connections.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false, // custom VM PostgreSQL — SSL likely disabled
    max: Number(process.env.PG_POOL_MAX || 3),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
});

pool.on("error", (err) => {
    console.error("PG pool error:", err.message);
});

export const query = (text: string, params?: any[]) => {
    return pool.query(text, params);
};

export default pool;
