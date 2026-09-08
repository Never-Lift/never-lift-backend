package com.neverlift.backend.track;

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.neverlift.backend.error.ApiException;
import com.neverlift.backend.track.dto.TrackCatalogResponse;
import com.neverlift.backend.track.dto.TrackCatalogResponse.TrackSummary;

@Service
public class TrackService {

    private static final String CONTRACT_ROOT = "contracts/module-2/v2/";
    private static final int DEFINITION_CACHE_SIZE = 4;

    private final ObjectMapper objectMapper;
    private final TrackCatalogResponse catalog;
    private final Map<String, TrackSummary> tracksById;
    private final Map<String, JsonNode> definitionCache = Collections.synchronizedMap(
            new LinkedHashMap<>(DEFINITION_CACHE_SIZE, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, JsonNode> eldest) {
                    return size() > DEFINITION_CACHE_SIZE;
                }
            });

    public TrackService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.catalog = readCatalog();
        this.tracksById = catalog.tracks().stream()
                .collect(Collectors.toUnmodifiableMap(TrackSummary::id, track -> track));
    }

    public TrackCatalogResponse getCatalog() {
        return catalog;
    }

    public JsonNode getDefinition(String id) {
        TrackSummary track = tracksById.get(id);
        if (track == null) {
            throw new ApiException(
                    HttpStatus.NOT_FOUND,
                    "track_not_found",
                    "Track does not exist in the active catalog");
        }

        synchronized (definitionCache) {
            return definitionCache.computeIfAbsent(id, ignored -> readDefinition(track));
        }
    }

    private TrackCatalogResponse readCatalog() {
        try (InputStream input = resource("catalog.json").getInputStream()) {
            return objectMapper.readValue(input, TrackCatalogResponse.class);
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to load the canonical track catalog", exception);
        }
    }

    private JsonNode readDefinition(TrackSummary track) {
        try (InputStream input = resource(track.definitionPath()).getInputStream()) {
            return objectMapper.readTree(input);
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to load track definition " + track.id(), exception);
        }
    }

    private ClassPathResource resource(String relativePath) {
        return new ClassPathResource(CONTRACT_ROOT + relativePath);
    }
}
