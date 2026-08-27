package com.neverlift.backend.track;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
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

    public static final String SCHEMA_VERSION = "2.0.0";
    public static final String CATALOG_VERSION = "2026.9";
    public static final String PHYSICS_CONTRACT_VERSION = "2.0.0";
    public static final int SEASON_REFERENCE = 2026;
    public static final String CALENDAR_POLICY = "original-24-round-freeze";

    private static final int TRACK_COUNT = 24;
    private static final String CONTRACT_ROOT = "contracts/module-2/v2/";
    private static final Set<String> BARRIER_TYPES = Set.of(
            "concrete-wall", "guardrail", "tecpro", "tyre-barrier");
    private static final String FENCE_TYPE = "debris-fence";
    private static final Set<String> CURB_SIDES = Set.of("left", "right");
    private static final Set<String> CURB_PALETTES = Set.of(
            "red-white", "orange-white", "red-white-blue", "green-white-red",
            "red-yellow", "green-yellow", "maroon-white", "blue-white");

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
        requireEqual(
                PHYSICS_CONTRACT_VERSION,
                catalog.physicsContractVersion(),
                "catalog physicsContractVersion");
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
        requireEqual(
                catalog.physicsContractVersion(),
                text(definition, "physicsContractVersion"),
                "definition physicsContractVersion");
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
        Set<Integer> elevationLayers = new HashSet<>();
        JsonNode previousPoint = null;
        JsonNode pointBeforePrevious = null;
        for (JsonNode point : centerline) {
            double halfWidthMeters = point.path("halfWidthMeters").asDouble(-1);
            JsonNode elevationLayer = point.get("elevationLayer");
            if (halfWidthMeters < 3.5 || halfWidthMeters > 13
                    || elevationLayer == null
                    || !elevationLayer.isIntegralNumber()
                    || elevationLayer.asInt() < 0
                    || elevationLayer.asInt() > 3) {
                throw invalid("centerline width or elevation layer for " + entry.id());
            }
            elevationLayers.add(elevationLayer.asInt());
            if (previousPoint != null) {
                double segmentLength = Math.hypot(
                        point.path("x").asDouble() - previousPoint.path("x").asDouble(),
                        point.path("y").asDouble() - previousPoint.path("y").asDouble());
                if (segmentLength > 5.02) {
                    throw invalid("centerline sampling gap for " + entry.id());
                }
            }
            if (pointBeforePrevious != null) {
                double previousHeading = Math.atan2(
                        previousPoint.path("y").asDouble() - pointBeforePrevious.path("y").asDouble(),
                        previousPoint.path("x").asDouble() - pointBeforePrevious.path("x").asDouble());
                double currentHeading = Math.atan2(
                        point.path("y").asDouble() - previousPoint.path("y").asDouble(),
                        point.path("x").asDouble() - previousPoint.path("x").asDouble());
                double headingDelta = Math.atan2(
                        Math.sin(currentHeading - previousHeading),
                        Math.cos(currentHeading - previousHeading));
                if (Math.abs(headingDelta) > Math.PI / 3.6) {
                    throw invalid("visibly angular centerline for " + entry.id());
                }
            }
            pointBeforePrevious = previousPoint;
            previousPoint = point;
        }
        if (Double.compare(first.path("x").asDouble(), last.path("x").asDouble()) != 0
                || Double.compare(first.path("y").asDouble(), last.path("y").asDouble()) != 0) {
            throw invalid("closed centerline for " + entry.id());
        }
        if (Math.abs(last.path("distanceMeters").asDouble() - entry.lengthMeters()) > 0.001) {
            throw invalid("centerline length for " + entry.id());
        }
        if ("suzuka".equals(entry.id()) && (!elevationLayers.contains(0) || !elevationLayers.contains(1))) {
            throw invalid("Suzuka must distinguish its overpass elevation layer");
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
                || definition.path("pitLane").path("path").size() < 25
                || !definition.path("sceneryLayout").isObject()
                || definition.path("source").path("environmentReferences").size() < 2) {
            throw invalid("required geometry for " + entry.id());
        }

        validateCurbs(entry, definition.path("curbs"));
        validatePitLane(entry, definition.path("pitLane"));
        validateInfrastructure(entry, definition.path("sceneryLayout"));
        validateTrackLimits(entry, definition.path("trackLimits"));
        validateBarrierGeometry(entry, definition.path("trackLimits"), definition.path("chunks"),
                definition.path("barrierGeometry"));
    }

    private void validatePitLane(CatalogEntry entry, JsonNode pitLane) {
        JsonNode visualStyle = pitLane.path("visualStyle");
        int garageCount = visualStyle.path("garageCount").asInt(-1);
        double buildingHeightMeters = visualStyle.path("buildingHeightMeters").asDouble(-1);
        Set<String> architectures = Set.of(
                "temporary-modular",
                "permanent-modern",
                "stepped-modern",
                "heritage",
                "urban-compact",
                "desert-canopy",
                "marina-canopy",
                "wing",
                "stadium",
                "exhibition");
        if (!visualStyle.isObject()
                || !architectures.contains(visualStyle.path("architecture").asText())
                || garageCount < 8
                || garageCount > 16
                || buildingHeightMeters < 3
                || buildingHeightMeters > 24
                || !numberInRange(visualStyle, "laneWidthMeters", 6, 16)
                || !numberInRange(visualStyle, "garageStartRatio", 0.05, 0.8)
                || !numberInRange(visualStyle, "garageEndRatio", 0.2, 0.95)
                || visualStyle.path("garageStartRatio").asDouble()
                        >= visualStyle.path("garageEndRatio").asDouble()
                || !numberInRange(visualStyle, "pitBoxLengthMeters", 3, 12)
                || !numberInRange(visualStyle, "pitBoxDepthMeters", 1.5, 4)
                || !numberInRange(visualStyle, "pitBoxCenterOffsetMeters", 1, 5)
                || !numberInRange(visualStyle, "garageDepthMeters", 3, 16)
                || !numberInRange(visualStyle, "garageCenterOffsetMeters", 6, 24)
                || !numberInRange(visualStyle, "pitWallHeightMeters", 0.6, 1.5)
                || !numberInRange(visualStyle, "canopyDepthMeters", 0, 5)
                || !isHexColor(visualStyle.path("primaryColor").asText())
                || !isHexColor(visualStyle.path("secondaryColor").asText())
                || !isHexColor(visualStyle.path("accentColor").asText())
                || !isHexColor(visualStyle.path("roofColor").asText())) {
            throw invalid("pit visual style for " + entry.id());
        }
    }

    private void validateInfrastructure(CatalogEntry entry, JsonNode sceneryLayout) {
        if (!sceneryLayout.path("landmarks").isArray()
                || !sceneryLayout.path("landmarks").isEmpty()
                || !sceneryLayout.path("staticObjects").isArray()
                || sceneryLayout.path("staticObjects").isEmpty()
                || !sceneryLayout.path("escapeRoads").isArray()) {
            throw invalid("infrastructure-only scenery for " + entry.id());
        }
        Set<String> utilityKinds = Set.of("start-gantry");
        Set<String> sceneryIds = new HashSet<>();
        boolean hasStartGantry = false;
        int authoredStructures = 0;
        int grandstands = 0;
        boolean hasStartAreaBuilding = false;
        for (JsonNode object : sceneryLayout.path("staticObjects")) {
            String objectId = object.path("id").asText();
            String kind = object.path("kind").asText();
            if (objectId.isBlank() || !sceneryIds.add(objectId) || "escape-bollard".equals(kind)) {
                throw invalid("unique visual infrastructure for " + entry.id());
            }
            hasStartGantry |= "start-gantry".equals(kind);
            if (utilityKinds.contains(kind)) {
                continue;
            }

            authoredStructures++;
            grandstands += kind.contains("grandstand") ? 1 : 0;
            hasStartAreaBuilding |= kind.contains("building") || kind.contains("tower");
            JsonNode visualStyle = object.path("visualStyle");
            JsonNode dimensions = object.path("dimensions");
            if (!visualStyle.isObject()
                    || !isHexColor(visualStyle.path("primaryColor").asText())
                    || !isHexColor(visualStyle.path("secondaryColor").asText())
                    || !isHexColor(visualStyle.path("accentColor").asText())
                    || !isHexColor(visualStyle.path("roofColor").asText())
                    || !dimensions.isObject()
                    || !numberInRange(dimensions, "lengthMeters", 0.01, 400)
                    || !numberInRange(dimensions, "depthMeters", 0.01, 120)
                    || !numberInRange(dimensions, "heightMeters", 0.01, 80)) {
                throw invalid("authored infrastructure palette for " + entry.id());
            }
        }
        if (!hasStartGantry
                || authoredStructures < 5
                || grandstands < 3
                || !hasStartAreaBuilding) {
            throw invalid("required track infrastructure for " + entry.id());
        }
        validateEscapeRoads(entry, sceneryLayout.path("escapeRoads"), sceneryIds);
    }

    private void validateEscapeRoads(CatalogEntry entry, JsonNode escapeRoads, Set<String> sceneryIds) {
        if (("monza".equals(entry.id()) && escapeRoads.size() != 1)
                || (!"monza".equals(entry.id()) && !escapeRoads.isEmpty())) {
            throw invalid("escape road assignment for " + entry.id());
        }
        for (JsonNode road : escapeRoads) {
            String roadId = road.path("id").asText();
            JsonNode path = road.path("path");
            JsonNode rows = road.path("obstacleRows");
            if (roadId.isBlank()
                    || !sceneryIds.add(roadId)
                    || !"slalom-block-rows".equals(road.path("kind").asText())
                    || !road.path("affectsPhysics").isBoolean()
                    || road.path("affectsPhysics").asBoolean(true)
                    || !road.path("elevationLayer").canConvertToInt()
                    || road.path("elevationLayer").asInt() < 0
                    || road.path("elevationLayer").asInt() > 3
                    || !numberInRange(road, "widthMeters", 4, 16)
                    || !path.isArray()
                    || path.size() < 2
                    || !rows.isArray()
                    || rows.size() < 3
                    || ("monza".equals(entry.id())
                            && (!"rettifilo-slalom".equals(roadId) || rows.size() < 5))) {
                throw invalid("visual-only escape road for " + entry.id());
            }
            for (JsonNode point : path) {
                validateVector(entry, point, "escape road path");
            }
            for (JsonNode row : rows) {
                if (!"red-white".equals(row.path("palette").asText())
                        || !numberInRange(row, "blockLengthMeters", 0.4, 4)) {
                    throw invalid("escape road obstacle row for " + entry.id());
                }
                validateVector(entry, row.path("from"), "escape road row start");
                validateVector(entry, row.path("to"), "escape road row end");
            }
        }
    }

    private void validateVector(CatalogEntry entry, JsonNode vector, String label) {
        if (!vector.isObject()
                || !vector.path("x").isNumber()
                || !vector.path("y").isNumber()) {
            throw invalid(label + " for " + entry.id());
        }
    }

    private boolean isHexColor(String value) {
        return value.matches("#[0-9a-fA-F]{6}");
    }

    private boolean numberInRange(JsonNode node, String field, double minimum, double maximum) {
        JsonNode value = node.path(field);
        return value.isNumber() && value.asDouble() >= minimum && value.asDouble() <= maximum;
    }

    private void validateBarrierGeometry(
            CatalogEntry entry,
            JsonNode trackLimits,
            JsonNode chunks,
            JsonNode barrierGeometry) {
        JsonNode limitSegments = trackLimits.path("segments");
        JsonNode barriers = barrierGeometry.path("segments");
        if (!barrierGeometry.isObject()
                || !barriers.isArray()
                || barriers.size() < limitSegments.size() * 2) {
            throw invalid("barrier geometry for " + entry.id());
        }

        Map<String, List<BarrierCoverage>> coverageBySide = new HashMap<>();
        for (int index = 0; index < barriers.size(); index++) {
            JsonNode barrier = barriers.get(index);
            int trackLimitIndex = barrier.path("trackLimitSegmentIndex").asInt(-1);
            String sideName = barrier.path("side").asText();
            double from = barrier.path("fromDistanceMeters").asDouble(-1);
            double to = barrier.path("toDistanceMeters").asDouble(-1);
            JsonNode path = barrier.path("path");
            JsonNode chunkIndexes = barrier.path("chunkIndexes");
            if (barrier.path("index").asInt(-1) != index
                    || trackLimitIndex < 0
                    || trackLimitIndex >= limitSegments.size()
                    || !Set.of("left", "right").contains(sideName)
                    || from < 0
                    || to <= from
                    || !BARRIER_TYPES.contains(barrier.path("material").asText())
                    || barrier.path("thicknessMeters").asDouble(-1) <= 0
                    || !"track-barrier".equals(barrier.path("collisionLayer").asText())
                    || !chunkIndexes.isArray()
                    || chunkIndexes.isEmpty()
                    || !path.isArray()
                    || path.size() < 2) {
                throw invalid("barrier segment for " + entry.id());
            }

            JsonNode limitSegment = limitSegments.get(trackLimitIndex);
            if (!barrier.path("material").asText()
                    .equals(limitSegment.path(sideName).path("barrier").asText())
                    || from < limitSegment.path("fromDistanceMeters").asDouble() - 0.001
                    || to > limitSegment.path("toDistanceMeters").asDouble() + 0.001) {
                throw invalid("barrier source segment for " + entry.id());
            }
            for (JsonNode chunkIndex : chunkIndexes) {
                if (!chunkIndex.isIntegralNumber()
                        || chunkIndex.asInt() < 0
                        || chunkIndex.asInt() >= chunks.size()) {
                    throw invalid("barrier chunk for " + entry.id());
                }
            }

            int elevationLayer = path.get(0).path("elevationLayer").asInt(-1);
            double previousDistance = -1;
            for (JsonNode point : path) {
                double distanceMeters = point.path("distanceMeters").asDouble(-1);
                if (!point.path("x").isNumber()
                        || !point.path("y").isNumber()
                        || distanceMeters <= previousDistance
                        || point.path("elevationLayer").asInt(-1) != elevationLayer) {
                    throw invalid("barrier path for " + entry.id());
                }
                previousDistance = distanceMeters;
            }
            if (Math.abs(path.get(0).path("distanceMeters").asDouble() - from) > 0.001
                    || Math.abs(path.get(path.size() - 1).path("distanceMeters").asDouble() - to) > 0.001) {
                throw invalid("barrier path range for " + entry.id());
            }
            coverageBySide
                    .computeIfAbsent(trackLimitIndex + ":" + sideName, ignored -> new ArrayList<>())
                    .add(new BarrierCoverage(from, to));
        }

        for (int index = 0; index < limitSegments.size(); index++) {
            JsonNode limitSegment = limitSegments.get(index);
            for (String sideName : Set.of("left", "right")) {
                List<BarrierCoverage> coverage = coverageBySide.get(index + ":" + sideName);
                if (coverage == null || coverage.isEmpty()) {
                    throw invalid("barrier side coverage for " + entry.id());
                }
                coverage.sort(Comparator.comparingDouble(BarrierCoverage::from));
                double expectedFrom = limitSegment.path("fromDistanceMeters").asDouble();
                for (BarrierCoverage part : coverage) {
                    if (Math.abs(part.from() - expectedFrom) > 0.001) {
                        throw invalid("barrier side gap or overlap for " + entry.id());
                    }
                    expectedFrom = part.to();
                }
                if (Math.abs(expectedFrom - limitSegment.path("toDistanceMeters").asDouble()) > 0.001) {
                    throw invalid("barrier side coverage end for " + entry.id());
                }
            }
        }
    }

    private void validateCurbs(CatalogEntry entry, JsonNode curbs) {
        if (!curbs.isArray() || curbs.isEmpty()) {
            throw invalid("curbs for " + entry.id());
        }
        for (int index = 0; index < curbs.size(); index++) {
            JsonNode curb = curbs.get(index);
            double from = curb.path("fromDistanceMeters").asDouble(-1);
            double to = curb.path("toDistanceMeters").asDouble(-1);
            double width = curb.path("widthMeters").asDouble(-1);
            double stripeLength = curb.path("stripeLengthMeters").asDouble(-1);
            if (curb.path("index").asInt(-1) != index
                    || from < 0
                    || to <= from
                    || to > entry.lengthMeters()
                    || !CURB_SIDES.contains(curb.path("side").asText())
                    || width < 0.3
                    || width > 2.5
                    || stripeLength < 0.5
                    || stripeLength > 8
                    || !CURB_PALETTES.contains(curb.path("palette").asText())) {
                throw invalid("curb segment for " + entry.id());
            }
            if (curb.has("outerColor") != curb.has("outerWidthMeters")
                    || (curb.has("outerColor")
                            && (!isHexColor(curb.path("outerColor").asText())
                                    || !numberInRange(curb, "outerWidthMeters", 0.1, 1.5)))) {
                throw invalid("curb outer paint for " + entry.id());
            }
        }
    }

    private void validateTrackLimits(CatalogEntry entry, JsonNode trackLimits) {
        if (!trackLimits.isObject()) {
            throw invalid("track limits for " + entry.id());
        }
        JsonNode segments = trackLimits.path("segments");
        if (!segments.isArray() || segments.isEmpty()) {
            throw invalid("track limit segments for " + entry.id());
        }

        double expectedFrom = 0;
        Set<String> surfaces = new HashSet<>();
        for (int index = 0; index < segments.size(); index++) {
            JsonNode segment = segments.get(index);
            double from = segment.path("fromDistanceMeters").asDouble(-1);
            double to = segment.path("toDistanceMeters").asDouble(-1);
            if (segment.path("index").asInt(-1) != index
                    || Math.abs(from - expectedFrom) > 0.001
                    || to <= from) {
                throw invalid("track limit coverage for " + entry.id());
            }
            validateSideEnvironment(entry, segment.path("left"), surfaces);
            validateSideEnvironment(entry, segment.path("right"), surfaces);
            expectedFrom = to;
        }
        if (Math.abs(expectedFrom - entry.lengthMeters()) > 0.001) {
            throw invalid("track limit length for " + entry.id());
        }
        if ("monaco".equals(entry.id()) && surfaces.stream().anyMatch(surface -> !"asphalt".equals(surface))) {
            throw invalid("Monaco must use only paved margins before its walls");
        }
        if ("interlagos".equals(entry.id()) && (!surfaces.contains("asphalt") || !surfaces.contains("grass"))) {
            throw invalid("Interlagos must mix audited asphalt and grass areas");
        }
    }

    private void validateSideEnvironment(CatalogEntry entry, JsonNode side, Set<String> surfaces) {
        JsonNode zones = side.path("zones");
        if (!side.isObject()
                || !zones.isArray()
                || zones.size() > 4
                || !isBarrierType(side.path("barrier").asText())
                || (side.has("fence")
                        && (!side.path("fence").isTextual()
                                || !FENCE_TYPE.equals(side.path("fence").asText())))) {
            throw invalid("side environment for " + entry.id());
        }
        if (side.has("fence")) {
            JsonNode style = side.path("fenceVisualStyle");
            if (!style.isObject()
                    || !numberInRange(style, "heightMeters", 2, 6)
                    || !numberInRange(style, "postSpacingMeters", 1.5, 5)
                    || !isHexColor(style.path("postColor").asText())
                    || !isHexColor(style.path("meshColor").asText())
                    || !numberInRange(style, "meshOpacity", 0.05, 0.5)
                    || !numberInRange(style, "cantileverMeters", 0, 1.2)) {
                throw invalid("fence visual style for " + entry.id());
            }
        } else if (side.has("fenceVisualStyle")) {
            throw invalid("orphan fence visual style for " + entry.id());
        }
        for (JsonNode zone : zones) {
            String surface = zone.path("surface").asText();
            double width = zone.path("widthMeters").asDouble(-1);
            if (!Set.of("asphalt", "grass", "gravel").contains(surface) || width <= 0 || width > 60) {
                throw invalid("environment zone for " + entry.id());
            }
            surfaces.add(surface);
        }
    }

    private boolean isBarrierType(String value) {
        return BARRIER_TYPES.contains(value);
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
            String physicsContractVersion,
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

    private record BarrierCoverage(double from, double to) {
    }
}
