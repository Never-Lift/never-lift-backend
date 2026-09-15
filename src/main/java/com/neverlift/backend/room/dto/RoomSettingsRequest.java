package com.neverlift.backend.room.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record RoomSettingsRequest(
        String trackId,
        @Min(2) @Max(22) Integer gridSize,
        Boolean botsEnabled,
        String botDifficulty,
        String visibility,
        @Min(1) @Max(99) Integer laps) {
    public RoomSettingsRequest(String trackId, Integer gridSize, Boolean botsEnabled, String botDifficulty, String visibility) {
        this(trackId, gridSize, botsEnabled, botDifficulty, visibility, null);
    }
}
