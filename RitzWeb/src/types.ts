// Using const object instead of enum for full compatibility across all TS/Node modes
export const BookingType = {
    Service: 1,
    Koeb: 2,
} as const;

export type BookingTypeValue = typeof BookingType[keyof typeof BookingType];

export type ChatSender = "guest" | "hotel";

export interface IChatMessage {
    id: number;
    bookingintern: number;
    afsender: ChatSender;
    besked: string;
    tidspunkt: string;
}

export interface IBooking {
    bookingintern: number;
    bookingextern: string;
    bookingtype: BookingTypeValue;
    navn: string;
    telefonnummer: string;
    ankomstdato: string;
    besked: string | null;
    godkendt: boolean;
    oprettet_dato: string;
    beskeder?: IChatMessage[];
}

export interface CreateBookingPayload {
    bookingextern: string;
    bookingtype: BookingTypeValue;
    navn: string;
    telefonnummer: string;
    ankomstdato: string;
    besked?: string;
}
