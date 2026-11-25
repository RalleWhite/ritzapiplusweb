-- Optional MariaDB / MySQL equivalent schema if you ever switch to MariaDB

CREATE TABLE IF NOT EXISTS brugerdata (
    bookingintern INT AUTO_INCREMENT PRIMARY KEY,
    bookingextern VARCHAR(100) NOT NULL,
    bookingtype INT NOT NULL, -- 1 = service, 2 = koeb
    navn VARCHAR(255) NOT NULL,
    telefonnummer VARCHAR(50) NOT NULL,
    ankomstdato DATETIME NOT NULL,
    besked VARCHAR(1000),
    godkendt BOOLEAN NOT NULL DEFAULT FALSE,
    oprettet_dato DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_brugerdata_bookingextern (bookingextern),
    INDEX idx_brugerdata_godkendt (godkendt)
);

CREATE TABLE IF NOT EXISTS booking_beskeder (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bookingintern INT NOT NULL,
    afsender ENUM('guest', 'hotel') NOT NULL,
    besked VARCHAR(1000) NOT NULL,
    tidspunkt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bookingintern) REFERENCES brugerdata(bookingintern) ON DELETE CASCADE
);
