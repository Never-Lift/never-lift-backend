package com.neverlift.backend.room.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record CreateRoomRequest(
        @Size(max = 40) String name,
        String trackId,
        @Min(2) @Max(22) Integer gridSize,
        Boolean botsEnabled,
        String botDifficulty,
        String visibility,
        @Size(max = 100) String password) {
}
