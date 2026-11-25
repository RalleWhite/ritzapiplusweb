import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const { Pool } = pg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export async function initDB(): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS brugerdata (
                bookingintern SERIAL PRIMARY KEY,
                bookingextern VARCHAR(100) NOT NULL,
                bookingtype INT NOT NULL CHECK (bookingtype IN (1, 2)),
                navn VARCHAR(255) NOT NULL,
                telefonnummer VARCHAR(50) NOT NULL,
                ankomstdato TIMESTAMPTZ NOT NULL,
                besked VARCHAR(1000),
                godkendt BOOLEAN NOT NULL DEFAULT FALSE,
                oprettet_dato TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_brugerdata_bookingextern ON brugerdata(bookingextern);
            CREATE INDEX IF NOT EXISTS idx_brugerdata_godkendt ON brugerdata(godkendt);

            CREATE TABLE IF NOT EXISTS booking_beskeder (
                id SERIAL PRIMARY KEY,
                bookingintern INT NOT NULL REFERENCES brugerdata(bookingintern) ON DELETE CASCADE,
                afsender VARCHAR(20) NOT NULL CHECK (afsender IN ('guest', 'hotel')),
                besked VARCHAR(1000) NOT NULL,
                tidspunkt TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_booking_beskeder_bookingintern ON booking_beskeder(bookingintern);
        `);
        console.log("Connected to PostgreSQL and verified tables (brugerdata, booking_beskeder).");
    } finally {
        client.release();
    }
}
