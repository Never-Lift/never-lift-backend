package com.neverlift.backend.room;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

public final class ConnectionTicket {

    public static final Duration VALIDITY = Duration.ofSeconds(60);
    public static final Duration RECONNECT_WINDOW = Duration.ofSeconds(30);

    private final String value;
    private final UUID userId;
    private final String roomCode;
    private final Instant issuedAt;
    private final Instant expiresAt;
    private boolean consumed;

    ConnectionTicket(String value, UUID userId, String roomCode, Instant issuedAt) {
        this.value = value;
        this.userId = userId;
        this.roomCode = roomCode;
        this.issuedAt = issuedAt;
        this.expiresAt = issuedAt.plus(VALIDITY);
    }

    public String getValue() {
        return value;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getRoomCode() {
        return roomCode;
    }

    public Instant getIssuedAt() {
        return issuedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public boolean isConsumed() {
        return consumed;
    }

    boolean canConsume(Instant now, Instant disconnectedAt) {
        if (!consumed) {
            return now.isBefore(expiresAt);
        }
        return disconnectedAt != null
                && !now.isAfter(disconnectedAt.plus(RECONNECT_WINDOW));
    }

    void consume() {
        consumed = true;
    }
}
