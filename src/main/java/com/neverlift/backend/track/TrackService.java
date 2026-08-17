package com.neverlift.backend.track;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.neverlift.backend.error.ApiException;
import com.neverlift.backend.track.dto.TrackCatalogResponse;
import com.neverlift.backend.track.dto.TrackCatalogResponse.TrackSummary;

@Service
public class TrackService {

    private final TrackRepository trackRepository;
    private final ObjectMapper objectMapper;

    public TrackService(TrackRepository trackRepository, ObjectMapper objectMapper) {
        this.trackRepository = trackRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public TrackCatalogResponse getCatalog() {
        return new TrackCatalogResponse(
                TrackCatalogImporter.SCHEMA_VERSION,
                TrackCatalogImporter.CATALOG_VERSION,
                TrackCatalogImporter.SEASON_REFERENCE,
                TrackCatalogImporter.CALENDAR_POLICY,
                trackRepository.findAllByOrderByRoundNumberAsc().stream()
                        .map(TrackSummary::from)
                        .toList());
    }

    @Transactional(readOnly = true)
    public JsonNode getDefinition(String id) {
        Track track = trackRepository.findById(id)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "track_not_found",
                        "Track does not exist in the active catalog"));
        try {
            return objectMapper.readTree(track.getDefinitionJson());
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored track definition is invalid: " + id, exception);
        }
    }
}
