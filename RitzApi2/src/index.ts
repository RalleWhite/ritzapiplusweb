import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { initDB } from "./lib/db.ts";
import bookingsRouter from "./routes/bookings.ts";

async function start() {
    dotenv.config({
        path: "./.env",
    });

    await initDB();

    const app = express();

    app.use(cors());
    app.use(express.json());

    app.get("/", (_req, res) => {
        res.json({ status: "ok", message: "RitzAPI PostgreSQL Server Running" });
    });

    app.use("/bookings", bookingsRouter);

    const port = process.env.HTTP_PORT || 5001;
    app.listen(port, () => {
        console.log("Server running on port " + port);
    });
}

start().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
