package com.neverlift.backend.room.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** The deliberately small room_state payload shared by the WebSocket clients. */
public record RoomStatePayload(
        String code,
        String name,
        List<RoomStatePlayer> players,
        UUID hostId,
        String hostName,
        RoomResponse.RoomResponseSettings settings,
        Map<UUID, Boolean> readyStates,
        boolean settingsLocked,
        String state,
        int participantCount,
        int limit) {

    public static RoomStatePayload from(RoomResponse room) {
        return new RoomStatePayload(
                room.code(),
                room.name(),
                room.players().stream()
                        .map(player -> new RoomStatePlayer(
                                player.id(), player.userId(), player.displayName(), player.color(),
                                player.bot(), player.connected(), player.joinedAt()))
                        .toList(),
                room.hostId(),
                room.hostName(),
                room.settings(),
                room.readyStates(),
                room.settingsLocked(),
                room.state(),
                room.participantCount(),
                room.limit());
    }

    public record RoomStatePlayer(
            UUID playerId,
            UUID userId,
            String displayName,
            String color,
            boolean isBot,
            boolean connected,
            java.time.Instant joinedAt) {
    }
}
