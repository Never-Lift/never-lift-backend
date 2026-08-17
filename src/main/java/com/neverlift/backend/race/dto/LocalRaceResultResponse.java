package com.neverlift.backend.race.dto;

import java.util.List;
import java.util.UUID;

public record LocalRaceResultResponse(int persistedCount, List<UUID> resultIds) {
}
