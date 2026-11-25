import { Router, Request, Response } from "express";
import { pool } from "../lib/db.ts";
import {
    BookingType,
    IBooking,
    IChatMessage,
    CreateBookingBody,
    UpdateBookingBody,
    CreateMessageBody,
} from "../models/booking.ts";

const router = Router();

// 1. GET /bookings - Fetch all bookings with optional filters
// Query params: ?bookingextern=XYZ&bookingtype=1&godkendt=false&telefonnummer=12345678
router.get("/", async (req: Request, res: Response) => {
    try {
        const { bookingextern, bookingtype, godkendt, telefonnummer } = req.query;

        const conditions: string[] = [];
        const values: unknown[] = [];

        if (bookingextern) {
            values.push(String(bookingextern));
            conditions.push(`bookingextern = $${values.length}`);
        }
        if (bookingtype !== undefined) {
            values.push(Number(bookingtype));
            conditions.push(`bookingtype = $${values.length}`);
        }
        if (godkendt !== undefined) {
            values.push(godkendt === "true");
            conditions.push(`godkendt = $${values.length}`);
        }
        if (telefonnummer) {
            values.push(String(telefonnummer));
            conditions.push(`telefonnummer = $${values.length}`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const sql = `
            SELECT * FROM brugerdata
            ${whereClause}
            ORDER BY ankomstdato ASC, bookingintern DESC
        `;

        const result = await pool.query(sql, values);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching bookings:", error);
        res.status(500).json({ error: "Failed to fetch bookings" });
    }
});

// 2. GET /bookings/extern/:bookingextern - Fetch bookings by external reference (for Android/Web lookup)
router.get("/extern/:bookingextern", async (req: Request, res: Response) => {
    try {
        const { bookingextern } = req.params;

        const bookingsResult = await pool.query(
            `SELECT * FROM brugerdata WHERE bookingextern = $1 ORDER BY bookingintern DESC`,
            [bookingextern]
        );

        if (bookingsResult.rows.length === 0) {
            res.status(404).json({ error: "No bookings found for this external booking reference" });
            return;
        }

        const bookingIds = bookingsResult.rows.map((b: IBooking) => b.bookingintern);
        const messagesResult = await pool.query<IChatMessage>(
            `SELECT * FROM booking_beskeder WHERE bookingintern = ANY($1::int[]) ORDER BY tidspunkt ASC`,
            [bookingIds]
        );

        const bookingsWithMessages = bookingsResult.rows.map((booking: IBooking) => ({
            ...booking,
            beskeder: messagesResult.rows.filter((m: IChatMessage) => m.bookingintern === booking.bookingintern),
        }));

        res.status(200).json(bookingsWithMessages);
    } catch (error) {
        console.error("Error fetching external booking:", error);
        res.status(500).json({ error: "Failed to fetch external booking" });
    }
});

// 3. GET /bookings/:bookingintern - Get a single booking by internal ID + chat messages
router.get("/:bookingintern", async (req: Request, res: Response) => {
    try {
        const bookingintern = Number(req.params.bookingintern);
        if (isNaN(bookingintern)) {
            res.status(400).json({ error: "bookingintern must be a valid integer" });
            return;
        }

        const bookingResult = await pool.query(
            `SELECT * FROM brugerdata WHERE bookingintern = $1`,
            [bookingintern]
        );

        if (bookingResult.rows.length === 0) {
            res.status(404).json({ error: "Booking not found" });
            return;
        }

        const messagesResult = await pool.query(
            `SELECT * FROM booking_beskeder WHERE bookingintern = $1 ORDER BY tidspunkt ASC`,
            [bookingintern]
        );

        res.status(200).json({
            ...bookingResult.rows[0],
            beskeder: messagesResult.rows,
        });
    } catch (error) {
        console.error("Error fetching single booking:", error);
        res.status(500).json({ error: "Failed to fetch booking" });
    }
});

// 4. POST /bookings - Create a new booking (and initial chat message if besked is provided)
router.post("/", async (req: Request<{}, {}, CreateBookingBody>, res: Response) => {
    const client = await pool.connect();
    try {
        const {
            bookingextern,
            bookingtype,
            navn,
            telefonnummer,
            ankomstdato,
            besked,
            godkendt,
        } = req.body;

        if (!bookingextern || bookingtype === undefined || !navn || !telefonnummer || !ankomstdato) {
            res.status(400).json({
                error: "Missing required fields: bookingextern, bookingtype (1=service, 2=koeb), navn, telefonnummer, ankomstdato",
            });
            return;
        }

        if (![BookingType.Service, BookingType.Koeb].includes(Number(bookingtype))) {
            res.status(400).json({
                error: "Invalid bookingtype. Use 1 for service or 2 for køb.",
            });
            return;
        }

        const parsedDate = new Date(ankomstdato);
        if (isNaN(parsedDate.getTime())) {
            res.status(400).json({ error: "Invalid ankomstdato format. Use ISO-8601 (e.g. 2026-11-15T14:00:00Z)" });
            return;
        }

        await client.query("BEGIN");

        const insertBookingSql = `
            INSERT INTO brugerdata (bookingextern, bookingtype, navn, telefonnummer, ankomstdato, besked, godkendt)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        const bookingResult = await client.query(insertBookingSql, [
            bookingextern.trim(),
            Number(bookingtype),
            navn.trim(),
            String(telefonnummer).trim(),
            parsedDate.toISOString(),
            besked ? besked.trim() : null,
            godkendt ?? false,
        ]);

        const createdBooking = bookingResult.rows[0];
        const beskeder = [];

        // If an initial message was included, also insert it into the chat history table
        if (besked && besked.trim().length > 0) {
            const msgResult = await client.query(
                `INSERT INTO booking_beskeder (bookingintern, afsender, besked)
                 VALUES ($1, 'guest', $2)
                 RETURNING *`,
                [createdBooking.bookingintern, besked.trim()]
            );
            beskeder.push(msgResult.rows[0]);
        }

        await client.query("COMMIT");

        res.status(201).json({
            ...createdBooking,
            beskeder,
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error creating booking:", error);
        res.status(500).json({ error: "Failed to create booking" });
    } finally {
        client.release();
    }
});

// 5. PATCH /bookings/:bookingintern - Approve booking (godkendt = true) or update fields
router.patch("/:bookingintern", async (req: Request<{ bookingintern: string }, {}, UpdateBookingBody>, res: Response) => {
    try {
        const bookingintern = Number(req.params.bookingintern);
        if (isNaN(bookingintern)) {
            res.status(400).json({ error: "bookingintern must be a valid integer" });
            return;
        }

        const { bookingextern, bookingtype, navn, telefonnummer, ankomstdato, besked, godkendt } = req.body;

        const fields: string[] = [];
        const values: unknown[] = [];

        if (bookingextern !== undefined) {
            values.push(bookingextern.trim());
            fields.push(`bookingextern = $${values.length}`);
        }
        if (bookingtype !== undefined) {
            if (![BookingType.Service, BookingType.Koeb].includes(Number(bookingtype))) {
                res.status(400).json({ error: "Invalid bookingtype. Use 1 (service) or 2 (køb)." });
                return;
            }
            values.push(Number(bookingtype));
            fields.push(`bookingtype = $${values.length}`);
        }
        if (navn !== undefined) {
            values.push(navn.trim());
            fields.push(`navn = $${values.length}`);
        }
        if (telefonnummer !== undefined) {
            values.push(String(telefonnummer).trim());
            fields.push(`telefonnummer = $${values.length}`);
        }
        if (ankomstdato !== undefined) {
            const parsedDate = new Date(ankomstdato);
            if (isNaN(parsedDate.getTime())) {
                res.status(400).json({ error: "Invalid ankomstdato format" });
                return;
            }
            values.push(parsedDate.toISOString());
            fields.push(`ankomstdato = $${values.length}`);
        }
        if (besked !== undefined) {
            values.push(besked);
            fields.push(`besked = $${values.length}`);
        }
        if (godkendt !== undefined) {
            values.push(Boolean(godkendt));
            fields.push(`godkendt = $${values.length}`);
        }

        if (fields.length === 0) {
            res.status(400).json({ error: "No fields provided to update" });
            return;
        }

        values.push(bookingintern);
        const sql = `
            UPDATE brugerdata
            SET ${fields.join(", ")}
            WHERE bookingintern = $${values.length}
            RETURNING *
        `;

        const result = await pool.query(sql, values);
        if (result.rows.length === 0) {
            res.status(404).json({ error: "Booking not found" });
            return;
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error("Error updating booking:", error);
        res.status(500).json({ error: "Failed to update booking" });
    }
});

// 6. GET /bookings/:bookingintern/messages - Get all chat messages for a booking
router.get("/:bookingintern/messages", async (req: Request, res: Response) => {
    try {
        const bookingintern = Number(req.params.bookingintern);
        if (isNaN(bookingintern)) {
            res.status(400).json({ error: "bookingintern must be a valid integer" });
            return;
        }

        const result = await pool.query(
            `SELECT * FROM booking_beskeder WHERE bookingintern = $1 ORDER BY tidspunkt ASC`,
            [bookingintern]
        );

        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching chat messages:", error);
        res.status(500).json({ error: "Failed to fetch chat messages" });
    }
});

// 7. POST /bookings/:bookingintern/messages - Add a new chat message to a booking (chatfeature)
router.post("/:bookingintern/messages", async (req: Request<{ bookingintern: string }, {}, CreateMessageBody>, res: Response) => {
    try {
        const bookingintern = Number(req.params.bookingintern);
        if (isNaN(bookingintern)) {
            res.status(400).json({ error: "bookingintern must be a valid integer" });
            return;
        }

        const { afsender, besked } = req.body;
        if (!afsender || !["guest", "hotel"].includes(afsender) || !besked || !besked.trim()) {
            res.status(400).json({
                error: "Required fields: afsender ('guest' or 'hotel') and non-empty besked",
            });
            return;
        }

        // Verify booking exists
        const bookingCheck = await pool.query(
            `SELECT bookingintern FROM brugerdata WHERE bookingintern = $1`,
            [bookingintern]
        );
        if (bookingCheck.rows.length === 0) {
            res.status(404).json({ error: "Booking not found" });
            return;
        }

        // Insert into chat table and also update latest 'besked' on brugerdata
        const msgResult = await pool.query(
            `INSERT INTO booking_beskeder (bookingintern, afsender, besked)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [bookingintern, afsender, besked.trim()]
        );

        await pool.query(
            `UPDATE brugerdata SET besked = $1 WHERE bookingintern = $2`,
            [besked.trim(), bookingintern]
        );

        res.status(201).json(msgResult.rows[0]);
    } catch (error) {
        console.error("Error creating chat message:", error);
        res.status(500).json({ error: "Failed to send chat message" });
    }
});

// 8. DELETE /bookings/:bookingintern - Delete a booking
router.delete("/:bookingintern", async (req: Request, res: Response) => {
    try {
        const bookingintern = Number(req.params.bookingintern);
        if (isNaN(bookingintern)) {
            res.status(400).json({ error: "bookingintern must be a valid integer" });
            return;
        }

        const result = await pool.query(
            `DELETE FROM brugerdata WHERE bookingintern = $1 RETURNING *`,
            [bookingintern]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: "Booking not found" });
            return;
        }

        res.status(200).json({ message: "Booking deleted", deleted: result.rows[0] });
    } catch (error) {
        console.error("Error deleting booking:", error);
        res.status(500).json({ error: "Failed to delete booking" });
    }
});

export default router;
