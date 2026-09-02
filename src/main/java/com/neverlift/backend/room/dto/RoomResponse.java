package com.neverlift.backend.room.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.neverlift.backend.room.Room;

public record RoomResponse(
        String code,
        String name,
        UUID hostId,
        String hostName,
        String trackId,
        String trackCatalogVersion,
        String physicsContractVersion,
        int participantCount,
        int limit,
        RoomResponseSettings settings,
        String state,
        boolean settingsLocked,
        List<RoomParticipantResponse> players,
        Map<UUID, Boolean> readyStates) {

    public static RoomResponse from(Room room) {
        var settings = room.getSettings();
        return new RoomResponse(
                room.getCode(),
                room.getName(),
                room.getHostId(),
                room.getHostDisplayName(),
                settings.trackId(),
                settings.trackCatalogVersion(),
                settings.physicsContractVersion(),
                room.getParticipantCount(),
                settings.gridSize(),
                RoomResponseSettings.from(room),
                room.getState().name().toLowerCase(),
                settings.settingsLocked(),
                room.getParticipants().stream().map(RoomParticipantResponse::from).toList(),
                room.getParticipants().stream().collect(java.util.stream.Collectors.toMap(
                        com.neverlift.backend.room.RoomParticipant::getId,
                        com.neverlift.backend.room.RoomParticipant::isReady,
                        (first, ignored) -> first, java.util.LinkedHashMap::new)));
    }

    public record RoomResponseSettings(
            String trackId,
            String trackCatalogVersion,
            String physicsContractVersion,
            int gridSize,
            boolean botsEnabled,
            String botDifficulty,
            String visibility,
            boolean settingsLocked) {

        static RoomResponseSettings from(Room room) {
            var settings = room.getSettings();
            return new RoomResponseSettings(
                    settings.trackId(),
                    settings.trackCatalogVersion(),
                    settings.physicsContractVersion(),
                    settings.gridSize(),
                    settings.botsEnabled(),
                    settings.botDifficulty().name().toLowerCase(),
                    settings.visibility().name().toLowerCase(),
                    settings.settingsLocked());
        }
    }
}
