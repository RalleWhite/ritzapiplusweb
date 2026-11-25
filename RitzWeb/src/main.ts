import {
    checkApiHealth,
    fetchBookingsByExtern,
    createBooking,
    sendGuestMessage,
} from "./api.ts";
import { BookingType, type BookingTypeValue, type IBooking, type IChatMessage } from "./types.ts";

// Application State
let currentBookingExtern: string = localStorage.getItem("ritz_bookingextern") || "";
let bookings: IBooking[] = [];
let selectedBookingIntern: number | null = null;

// DOM Elements
const apiIndicator = document.getElementById("api-indicator") as HTMLSpanElement;
const apiStatusText = document.getElementById("api-status-text") as HTMLSpanElement;

const lookupForm = document.getElementById("lookup-form") as HTMLFormElement;
const lookupExternInput = document.getElementById("lookup-extern") as HTMLInputElement;

const createForm = document.getElementById("create-booking-form") as HTMLFormElement;
const externInput = document.getElementById("bookingextern") as HTMLInputElement;
const typeSelect = document.getElementById("bookingtype") as HTMLSelectElement;
const navnInput = document.getElementById("navn") as HTMLInputElement;
const telefonInput = document.getElementById("telefonnummer") as HTMLInputElement;
const ankomstInput = document.getElementById("ankomstdato") as HTMLInputElement;
const beskedInput = document.getElementById("besked") as HTMLTextAreaElement;
const createFeedback = document.getElementById("create-feedback") as HTMLDivElement;

const activeRefLabel = document.getElementById("active-ref-label") as HTMLParagraphElement;
const refreshBtn = document.getElementById("refresh-btn") as HTMLButtonElement;
const bookingsListEl = document.getElementById("bookings-list") as HTMLDivElement;

const chatCard = document.getElementById("chat-card") as HTMLDivElement;
const chatTitle = document.getElementById("chat-title") as HTMLHeadingElement;
const chatSubtitle = document.getElementById("chat-subtitle") as HTMLParagraphElement;
const chatApprovalBadge = document.getElementById("chat-approval-badge") as HTMLSpanElement;
const chatMessagesEl = document.getElementById("chat-messages") as HTMLDivElement;
const chatForm = document.getElementById("chat-form") as HTMLFormElement;
const chatInput = document.getElementById("chat-input") as HTMLInputElement;

// Format Date helper
function formatDate(isoString: string): string {
    const d = new Date(isoString);
    return d.toLocaleString("da-DK", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// Escape HTML to prevent XSS
function escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// Set default datetime-local value to 1 hour from now
function setDefaultDateTime(): void {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset() + 60);
    ankomstInput.value = now.toISOString().slice(0, 16);
}

// Check API connectivity
async function updateApiStatus(): Promise<void> {
    const online = await checkApiHealth();
    if (online) {
        apiIndicator.className = "status-dot online";
        apiStatusText.textContent = "API Forbundet (Port 5001)";
    } else {
        apiIndicator.className = "status-dot offline";
        apiStatusText.textContent = "API Offline (Start RitzAPI på port 5001)";
    }
}

// Render the list of bookings for the guest
function renderBookingsList(): void {
    if (!currentBookingExtern) {
        activeRefLabel.textContent = "Ingen booking valgt endnu";
        bookingsListEl.innerHTML = `
            <div class="empty-state">
                Søg på dit bookingnummer til venstre eller opret en ny bestilling for at komme i gang.
            </div>
        `;
        chatCard.classList.add("hidden");
        return;
    }

    activeRefLabel.innerHTML = `Viser bestillinger for bookingnummer: <strong>${escapeHtml(currentBookingExtern)}</strong>`;

    if (bookings.length === 0) {
        bookingsListEl.innerHTML = `
            <div class="empty-state">
                Ingen bestillinger fundet for <strong>${escapeHtml(currentBookingExtern)}</strong>. Du kan oprette en ny bestilling i formularen til venstre.
            </div>
        `;
        chatCard.classList.add("hidden");
        return;
    }

    bookingsListEl.innerHTML = bookings
        .map((b) => {
            const isSelected = b.bookingintern === selectedBookingIntern;
            const typeLabel = b.bookingtype === BookingType.Service ? "Service" : "Køb";
            const typeClass = b.bookingtype === BookingType.Service ? "badge-service" : "badge-koeb";
            const statusLabel = b.godkendt ? "✓ Godkendt af hotel" : "⏳ Afventer godkendelse";
            const statusClass = b.godkendt ? "badge-approved" : "badge-pending";
            const msgCount = b.beskeder ? b.beskeder.length : 0;

            return `
                <div class="booking-item ${isSelected ? "selected" : ""}" data-id="${b.bookingintern}">
                    <div class="booking-item-top">
                        <div class="booking-badges">
                            <span class="booking-id">#${b.bookingintern}</span>
                            <span class="badge ${typeClass}">${typeLabel}</span>
                            <span class="badge ${statusClass}">${statusLabel}</span>
                        </div>
                        <span class="booking-date">${formatDate(b.ankomstdato)}</span>
                    </div>
                    <div class="booking-item-body">
                        <p class="guest-info"><strong>${escapeHtml(b.navn)}</strong> (${escapeHtml(b.telefonnummer)})</p>
                        <p class="latest-msg">${
                            b.besked
                                ? `Seneste besked: "${escapeHtml(b.besked)}"`
                                : "<em>Ingen beskeder endnu</em>"
                        }</p>
                    </div>
                    <div class="booking-item-footer">
                        <span class="chat-count">💬 ${msgCount} ${msgCount === 1 ? "besked" : "beskeder"}</span>
                        <span class="open-chat-link">Åbn chat →</span>
                    </div>
                </div>
            `;
        })
        .join("");

    // Attach click listeners to select a booking for chat
    document.querySelectorAll<HTMLDivElement>(".booking-item").forEach((el) => {
        el.addEventListener("click", () => {
            const id = Number(el.dataset.id);
            selectBooking(id);
        });
    });
}

// Select a booking and render its chat
function selectBooking(bookingintern: number): void {
    selectedBookingIntern = bookingintern;
    renderBookingsList();
    renderChatPanel();
}

// Render the active chat panel
function renderChatPanel(): void {
    const activeBooking = bookings.find((b) => b.bookingintern === selectedBookingIntern);
    if (!activeBooking) {
        chatCard.classList.add("hidden");
        return;
    }

    chatCard.classList.remove("hidden");
    const typeLabel = activeBooking.bookingtype === BookingType.Service ? "Service" : "Køb";
    chatTitle.textContent = `Bestilling #${activeBooking.bookingintern} (${typeLabel})`;
    chatSubtitle.textContent = `Bookingref: ${activeBooking.bookingextern} • ${formatDate(activeBooking.ankomstdato)}`;

    if (activeBooking.godkendt) {
        chatApprovalBadge.className = "badge badge-approved";
        chatApprovalBadge.textContent = "✓ Godkendt";
    } else {
        chatApprovalBadge.className = "badge badge-pending";
        chatApprovalBadge.textContent = "⏳ Afventer godkendelse";
    }

    const messages: IChatMessage[] = activeBooking.beskeder || [];
    if (messages.length === 0) {
        chatMessagesEl.innerHTML = `
            <div class="chat-empty">
                Ingen beskeder i samtalen endnu. Skriv en besked herunder til receptionen.
            </div>
        `;
    } else {
        chatMessagesEl.innerHTML = messages
            .map((m) => {
                const isGuest = m.afsender === "guest";
                return `
                    <div class="chat-bubble-row ${isGuest ? "row-guest" : "row-hotel"}">
                        <div class="chat-bubble ${isGuest ? "bubble-guest" : "bubble-hotel"}">
                            <div class="bubble-meta">
                                <strong>${isGuest ? "Dig (Gæst)" : "Hotel Reception"}</strong>
                                <span>${formatDate(m.tidspunkt)}</span>
                            </div>
                            <div class="bubble-text">${escapeHtml(m.besked)}</div>
                        </div>
                    </div>
                `;
            })
            .join("");

        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }
}

// Load bookings from the API for the current bookingextern
async function loadBookingsForExtern(externCode: string, autoSelectFirst = false): Promise<void> {
    currentBookingExtern = externCode.trim();
    localStorage.setItem("ritz_bookingextern", currentBookingExtern);
    lookupExternInput.value = currentBookingExtern;
    externInput.value = currentBookingExtern;

    try {
        bookings = await fetchBookingsByExtern(currentBookingExtern);

        if (bookings.length > 0) {
            // Pre-fill guest name & phone from their existing booking for convenience
            if (!navnInput.value) navnInput.value = bookings[0].navn;
            if (!telefonInput.value) telefonInput.value = bookings[0].telefonnummer;

            const stillExists = bookings.some((b) => b.bookingintern === selectedBookingIntern);
            if (autoSelectFirst || !stillExists) {
                selectedBookingIntern = bookings[0].bookingintern;
            }
        } else {
            selectedBookingIntern = null;
        }

        renderBookingsList();
        renderChatPanel();
    } catch (err) {
        console.error(err);
    }
}

// Show feedback banner on create form
function showFeedback(message: string, isError = false): void {
    createFeedback.textContent = message;
    createFeedback.className = `feedback ${isError ? "feedback-error" : "feedback-success"}`;
    setTimeout(() => {
        createFeedback.className = "feedback hidden";
    }, 4500);
}

// Event Listeners
lookupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = lookupExternInput.value.trim();
    if (!code) return;
    await loadBookingsForExtern(code, true);
});

createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bookingextern = externInput.value.trim();
    const bookingtype = Number(typeSelect.value) as BookingTypeValue;
    const navn = navnInput.value.trim();
    const telefonnummer = telefonInput.value.trim();
    const ankomstdatoRaw = ankomstInput.value;
    const besked = beskedInput.value.trim();

    if (!bookingextern || !navn || !telefonnummer || !ankomstdatoRaw) {
        showFeedback("Udfyld venligst alle påkrævede felter.", true);
        return;
    }

    try {
        const created = await createBooking({
            bookingextern,
            bookingtype,
            navn,
            telefonnummer,
            ankomstdato: new Date(ankomstdatoRaw).toISOString(),
            besked: besked || undefined,
        });

        beskedInput.value = "";
        showFeedback(`Bestilling #${created.bookingintern} er modtaget! Afventer godkendelse.`);

        selectedBookingIntern = created.bookingintern;
        await loadBookingsForExtern(bookingextern, false);
    } catch (err: any) {
        showFeedback(err.message || "Fejl ved oprettelse af bestilling", true);
    }
});

chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedBookingIntern) return;

    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.disabled = true;
    try {
        await sendGuestMessage(selectedBookingIntern, text);
        chatInput.value = "";
        await loadBookingsForExtern(currentBookingExtern, false);
    } catch (err) {
        console.error("Failed to send chat message:", err);
    } finally {
        chatInput.disabled = false;
        chatInput.focus();
    }
});

refreshBtn.addEventListener("click", async () => {
    await updateApiStatus();
    if (currentBookingExtern) {
        await loadBookingsForExtern(currentBookingExtern, false);
    }
});

// Initialize App & Poll every 4 seconds for updates from the Android Staff App
async function init(): Promise<void> {
    setDefaultDateTime();
    await updateApiStatus();

    if (currentBookingExtern) {
        await loadBookingsForExtern(currentBookingExtern, true);
    }

    setInterval(async () => {
        await updateApiStatus();
        if (currentBookingExtern) {
            await loadBookingsForExtern(currentBookingExtern, false);
        }
    }, 4000);
}

init();
