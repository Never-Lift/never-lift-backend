package com.neverlift.backend.room.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record RoomSettingsRequest(
        String trackId,
        @Min(2) @Max(22) Integer gridSize,
        Boolean botsEnabled,
        String botDifficulty,
        String visibility) {
}
