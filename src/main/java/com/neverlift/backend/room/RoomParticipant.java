package com.neverlift.backend.room;

import java.time.Instant;
import java.util.UUID;

public final class RoomParticipant {

    private final UUID id;
    private final UUID userId;
    private final String displayName;
    private final boolean bot;
    private final Instant joinedAt;
    private boolean ready;
    private boolean connected;
    private Instant disconnectedAt;
    private String color;

    private RoomParticipant(UUID id, UUID userId, String displayName, boolean bot, Instant joinedAt) {
        this.id = id;
        this.userId = userId;
        this.displayName = displayName;
        this.bot = bot;
        this.joinedAt = joinedAt;
        this.connected = true;
        this.color = "#a84448";
    }

    public static RoomParticipant human(UUID userId, Instant joinedAt) {
        return human(userId, userId.toString(), joinedAt);
    }

    public static RoomParticipant human(UUID userId, String displayName, Instant joinedAt) {
        return new RoomParticipant(userId, userId, displayName, false, joinedAt);
    }

    public static RoomParticipant bot(Instant joinedAt) {
        UUID botId = UUID.randomUUID();
        return new RoomParticipant(botId, null, "Bot", true, joinedAt);
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public boolean isBot() {
        return bot;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }

    public boolean isReady() {
        return ready;
    }

    public void setReady(boolean ready) {
        this.ready = ready;
    }

    public boolean isConnected() {
        return connected;
    }

    public void setConnected(boolean connected) {
        this.connected = connected;
        if (connected) {
            this.disconnectedAt = null;
        }
    }

    void markDisconnected(Instant at) {
        this.connected = false;
        this.disconnectedAt = at;
    }

    void markConnected() {
        this.connected = true;
        this.disconnectedAt = null;
    }

    public Instant getDisconnectedAt() {
        return disconnectedAt;
    }

    public String getColor() {
        return color;
    }

    public void setColor(String color) {
        this.color = color;
    }
}
