package com.neverlift.backend.race.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

public record LocalRaceEntryRequest(
        UUID userIdOrNull,
        @NotNull @Positive Integer position,
        @NotNull @PositiveOrZero Long totalTimeMs,
        @NotNull @PositiveOrZero Long bestLapTimeMs,
        @NotNull Boolean finished) {
}
