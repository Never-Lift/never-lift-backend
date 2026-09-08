package com.neverlift.backend.track.dto;

import java.util.List;

public record TrackCatalogResponse(
        String schemaVersion,
        String catalogVersion,
        String physicsContractVersion,
        int seasonReference,
        String calendarPolicy,
        List<TrackSummary> tracks) {

    public record TrackSummary(
            int round,
            String id,
            String name,
            String countryCode,
            String countryName,
            String locality,
            int lengthMeters,
            String definitionPath) {
    }
}
