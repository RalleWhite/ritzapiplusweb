export enum BookingType {
    Service = 1, // service
    Koeb = 2,    // køb
}

export type ChatSender = "guest" | "hotel";

export interface IChatMessage {
    id: number;
    bookingintern: number;
    afsender: ChatSender;
    besked: string;
    tidspunkt: Date;
}

export interface IBooking {
    bookingintern: number;
    bookingextern: string;
    bookingtype: BookingType;
    navn: string;
    telefonnummer: string;
    ankomstdato: Date;
    besked: string | null;
    godkendt: boolean;
    oprettet_dato: Date;
    beskeder?: IChatMessage[];
}

export interface CreateBookingBody {
    bookingextern: string;
    bookingtype: BookingType;
    navn: string;
    telefonnummer: string | number;
    ankomstdato: string;
    besked?: string;
    godkendt?: boolean;
}

export interface UpdateBookingBody {
    bookingextern?: string;
    bookingtype?: BookingType;
    navn?: string;
    telefonnummer?: string | number;
    ankomstdato?: string;
    besked?: string;
    godkendt?: boolean;
}

export interface CreateMessageBody {
    afsender: ChatSender;
    besked: string;
}
