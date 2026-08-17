package com.neverlift.backend.track;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class TrackCatalogImporter implements ApplicationRunner {

    public static final String SCHEMA_VERSION = "1.0.0";
    public static final String CATALOG_VERSION = "2026.1";
    public static final int SEASON_REFERENCE = 2026;
    public static final String CALENDAR_POLICY = "original-24-round-freeze";

    private static final int TRACK_COUNT = 24;
    private static final String CONTRACT_ROOT = "contracts/module-2/v1/";

    private final ObjectMapper objectMapper;
    private final TrackRepository trackRepository;

    public TrackCatalogImporter(ObjectMapper objectMapper, TrackRepository trackRepository) {
        this.objectMapper = objectMapper;
        this.trackRepository = trackRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        CatalogDocument catalog = readCatalog();
        validateCatalog(catalog);

        List<Track> tracks = catalog.tracks().stream()
                .map(entry -> toTrack(catalog, entry))
                .toList();
        trackRepository.saveAll(tracks);
        trackRepository.flush();
    }

    private CatalogDocument readCatalog() {
        try (InputStream input = resource("catalog.json").getInputStream()) {
            return objectMapper.readValue(input, CatalogDocument.class);
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to load the canonical track catalog", exception);
        }
    }

    private Track toTrack(CatalogDocument catalog, CatalogEntry entry) {
        String definitionJson;
        JsonNode definition;
        try (InputStream input = resource(entry.definitionPath()).getInputStream()) {
            definitionJson = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            definition = objectMapper.readTree(definitionJson);
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to load track definition " + entry.id(), exception);
        }

        validateDefinition(catalog, entry, definition);
        return new Track(
                entry.id(),
                entry.round(),
                entry.name(),
                entry.countryCode(),
                entry.countryName(),
                entry.locality(),
                entry.lengthMeters(),
                entry.definitionPath(),
                catalog.schemaVersion(),
                catalog.catalogVersion(),
                definitionJson);
    }

    private void validateCatalog(CatalogDocument catalog) {
        requireEqual(SCHEMA_VERSION, catalog.schemaVersion(), "catalog schemaVersion");
        requireEqual(CATALOG_VERSION, catalog.catalogVersion(), "catalog catalogVersion");
        if (catalog.seasonReference() != SEASON_REFERENCE) {
            throw invalid("catalog seasonReference");
        }
        requireEqual(CALENDAR_POLICY, catalog.calendarPolicy(), "catalog calendarPolicy");
        if (catalog.tracks() == null || catalog.tracks().size() != TRACK_COUNT) {
            throw invalid("catalog must contain exactly 24 tracks");
        }

        Set<String> ids = new HashSet<>();
        Set<Integer> rounds = new HashSet<>();
        for (CatalogEntry entry : catalog.tracks()) {
            if (!ids.add(entry.id()) || !rounds.add(entry.round())) {
                throw invalid("catalog ids and rounds must be unique");
            }
            if (entry.round() < 1 || entry.round() > TRACK_COUNT || entry.lengthMeters() <= 0) {
                throw invalid("catalog round and length values");
            }
            requireEqual("tracks/" + entry.id() + ".json", entry.definitionPath(), "definitionPath");
        }
    }

    private void validateDefinition(CatalogDocument catalog, CatalogEntry entry, JsonNode definition) {
        requireEqual(catalog.schemaVersion(), text(definition, "schemaVersion"), "definition schemaVersion");
        requireEqual(catalog.catalogVersion(), text(definition, "catalogVersion"), "definition catalogVersion");
        requireEqual(entry.id(), text(definition, "id"), "definition id");
        requireEqual(entry.name(), text(definition, "name"), "definition name");
        requireEqual(entry.countryCode(), text(definition, "countryCode"), "definition countryCode");
        requireEqual(entry.locality(), text(definition, "locality"), "definition locality");
        if (definition.path("lengthMeters").asInt(-1) != entry.lengthMeters()) {
            throw invalid("definition lengthMeters for " + entry.id());
        }

        JsonNode centerline = definition.path("centerline");
        if (!centerline.isArray() || centerline.size() < 3) {
            throw invalid("centerline for " + entry.id());
        }
        JsonNode first = centerline.get(0);
        JsonNode last = centerline.get(centerline.size() - 1);
        if (Double.compare(first.path("x").asDouble(), last.path("x").asDouble()) != 0
                || Double.compare(first.path("y").asDouble(), last.path("y").asDouble()) != 0) {
            throw invalid("closed centerline for " + entry.id());
        }
        if (Math.abs(last.path("distanceMeters").asDouble() - entry.lengthMeters()) > 0.001) {
            throw invalid("centerline length for " + entry.id());
        }

        JsonNode checkpoints = definition.path("checkpoints");
        if (!checkpoints.isArray() || checkpoints.size() != 8) {
            throw invalid("checkpoints for " + entry.id());
        }
        double previousDistance = -1;
        for (int index = 0; index < checkpoints.size(); index++) {
            JsonNode checkpoint = checkpoints.get(index);
            double distance = checkpoint.path("distanceMeters").asDouble(-1);
            if (checkpoint.path("index").asInt(-1) != index || distance <= previousDistance) {
                throw invalid("checkpoint order for " + entry.id());
            }
            previousDistance = distance;
        }

        if (definition.path("gridSlots").size() != 4
                || definition.path("racingLine").size() != centerline.size()
                || definition.path("pitLane").path("path").size() < 2
                || !definition.path("sceneryLayout").isObject()) {
            throw invalid("required geometry for " + entry.id());
        }
    }

    private ClassPathResource resource(String relativePath) {
        return new ClassPathResource(CONTRACT_ROOT + relativePath);
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || value.textValue().isBlank()) {
            throw invalid(field);
        }
        return value.textValue();
    }

    private void requireEqual(Object expected, Object actual, String field) {
        if (!expected.equals(actual)) {
            throw invalid(field);
        }
    }

    private IllegalStateException invalid(String detail) {
        return new IllegalStateException("Invalid canonical track contract: " + detail);
    }

    private record CatalogDocument(
            String schemaVersion,
            String catalogVersion,
            int seasonReference,
            String calendarPolicy,
            List<CatalogEntry> tracks) {
    }

    private record CatalogEntry(
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
