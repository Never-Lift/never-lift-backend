package com.neverlift.backend.track.dto;

import java.util.List;

import com.neverlift.backend.track.Track;

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

        public static TrackSummary from(Track track) {
            return new TrackSummary(
                    track.getRoundNumber(),
                    track.getId(),
                    track.getName(),
                    track.getCountryCode(),
                    track.getCountryName(),
                    track.getLocality(),
                    track.getLengthMeters(),
                    track.getDefinitionPath());
        }
    }
}
