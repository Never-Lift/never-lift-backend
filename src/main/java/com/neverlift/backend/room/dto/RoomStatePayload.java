package com.neverlift.backend.room.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** The deliberately small room_state payload shared by the WebSocket clients. */
public record RoomStatePayload(
        List<RoomStatePlayer> players,
        UUID hostId,
        RoomResponse.RoomResponseSettings settings,
        Map<UUID, Boolean> readyStates,
        boolean settingsLocked) {

    public static RoomStatePayload from(RoomResponse room) {
        return new RoomStatePayload(
                room.players().stream()
                        .map(player -> new RoomStatePlayer(
                                player.id(), player.displayName(), player.color(), player.bot()))
                        .toList(),
                room.hostId(),
                room.settings(),
                room.readyStates(),
                room.settingsLocked());
    }

    public record RoomStatePlayer(UUID playerId, String displayName, String color, boolean isBot) {
    }
}
