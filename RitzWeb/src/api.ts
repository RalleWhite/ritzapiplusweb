import type { IBooking, IChatMessage, CreateBookingPayload } from "./types.ts";

export const API_BASE_URL = "http://localhost:5001";

export async function checkApiHealth(): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE_URL}/`);
        return res.ok;
    } catch {
        return false;
    }
}

export async function fetchBookingsByExtern(bookingextern: string): Promise<IBooking[]> {
    const res = await fetch(`${API_BASE_URL}/bookings/extern/${encodeURIComponent(bookingextern.trim())}`);
    if (res.status === 404) {
        return [];
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Kunne ikke hente bookinger");
    }
    return res.json();
}

export async function createBooking(payload: CreateBookingPayload): Promise<IBooking> {
    const res = await fetch(`${API_BASE_URL}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Kunne ikke oprette bestilling");
    }
    return res.json();
}

export async function fetchChatMessages(bookingintern: number): Promise<IChatMessage[]> {
    const res = await fetch(`${API_BASE_URL}/bookings/${bookingintern}/messages`);
    if (!res.ok) {
        throw new Error("Kunne ikke hente beskeder");
    }
    return res.json();
}

export async function sendGuestMessage(bookingintern: number, besked: string): Promise<IChatMessage> {
    const res = await fetch(`${API_BASE_URL}/bookings/${bookingintern}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            afsender: "guest",
            besked,
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Kunne ikke sende besked");
    }
    return res.json();
}
