import { Pool } from "pg";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false, // Since it is a custom VM PostgreSQL server, SSL is likely disabled by default, or we can use standard configuration
});

export const query = (text: string, params?: any[]) => {
    return pool.query(text, params);
};

export default pool;
