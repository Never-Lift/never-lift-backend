package com.neverlift.backend.track;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashSet;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "app.version=module-2-test")
@AutoConfigureMockMvc
class TrackCatalogIntegrationTest {

    private static final Set<String> BARRIER_TYPES = Set.of(
            "concrete-wall", "guardrail", "tecpro", "tyre-barrier");
    private static final String FENCE_TYPE = "debris-fence";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TrackRepository trackRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void shouldExposeTheCanonicalPublicCatalogInRoundOrder() throws Exception {
        mockMvc.perform(get("/api/tracks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schemaVersion").value("1.3.0"))
                .andExpect(jsonPath("$.catalogVersion").value("2026.5"))
                .andExpect(jsonPath("$.seasonReference").value(2026))
                .andExpect(jsonPath("$.calendarPolicy").value("original-24-round-freeze"))
                .andExpect(jsonPath("$.tracks.length()").value(24))
                .andExpect(jsonPath("$.tracks[0].round").value(1))
                .andExpect(jsonPath("$.tracks[0].id").value("albert-park"))
                .andExpect(jsonPath("$.tracks[23].round").value(24))
                .andExpect(jsonPath("$.tracks[23].id").value("yas-marina"));
    }

    @Test
    void shouldPersistAndValidateAllCanonicalTrackDefinitions() throws Exception {
        assertThat(trackRepository.count()).isEqualTo(24);
        assertThat(trackRepository.findAllByOrderByRoundNumberAsc())
                .extracting(Track::getRoundNumber)
                .containsExactly(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
                        13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24);

        boolean foundOptionalFence = false;
        Set<String> scenerySignatures = new HashSet<>();
        for (Track track : trackRepository.findAll()) {
            JsonNode definition = objectMapper.readTree(track.getDefinitionJson());
            assertThat(definition.path("schemaVersion").asText()).isEqualTo("1.3.0");
            assertThat(definition.path("catalogVersion").asText()).isEqualTo("2026.5");
            assertThat(definition.path("id").asText()).isEqualTo(track.getId());
            assertThat(definition.path("lengthMeters").asInt()).isEqualTo(track.getLengthMeters());

            JsonNode centerline = definition.path("centerline");
            JsonNode first = centerline.get(0);
            JsonNode last = centerline.get(centerline.size() - 1);
            assertThat(centerline.size()).isGreaterThan(3);
            assertThat(last.path("x").asDouble()).isEqualTo(first.path("x").asDouble());
            assertThat(last.path("y").asDouble()).isEqualTo(first.path("y").asDouble());
            assertThat(last.path("distanceMeters").asDouble())
                    .isCloseTo(track.getLengthMeters(), within(0.001));
            for (JsonNode point : centerline) {
                assertThat(point.path("halfWidthMeters").asDouble()).isBetween(3.5, 13.0);
                assertThat(point.path("elevationLayer").isIntegralNumber()).isTrue();
                assertThat(point.path("elevationLayer").asInt()).isBetween(0, 3);
            }

            JsonNode checkpoints = definition.path("checkpoints");
            assertThat(checkpoints.size()).isEqualTo(8);
            double previousDistance = -1;
            for (int index = 0; index < checkpoints.size(); index++) {
                assertThat(checkpoints.get(index).path("index").asInt()).isEqualTo(index);
                double distance = checkpoints.get(index).path("distanceMeters").asDouble();
                assertThat(distance).isGreaterThan(previousDistance);
                previousDistance = distance;
            }

            assertThat(definition.path("gridSlots").size()).isEqualTo(4);
            assertThat(definition.path("racingLine").size()).isEqualTo(centerline.size());
            assertThat(definition.path("startFinish").isObject()).isTrue();
            assertThat(definition.path("pitLane").path("path").size()).isGreaterThanOrEqualTo(2);
            JsonNode sceneryLayout = definition.path("sceneryLayout");
            assertThat(sceneryLayout.isObject()).isTrue();
            assertThat(sceneryLayout.path("landmarks").size()).isGreaterThanOrEqualTo(3);
            assertThat(sceneryLayout.path("staticObjects").size()).isGreaterThanOrEqualTo(2);
            assertThat(sceneryLayout.path("staticObjects").get(0).path("kind").asText())
                    .isEqualTo("start-gantry");
            Set<String> sceneryIds = new HashSet<>();
            for (String collection : Set.of("landmarks", "staticObjects")) {
                for (JsonNode sceneryObject : sceneryLayout.path(collection)) {
                    assertThat(sceneryIds.add(sceneryObject.path("id").asText()))
                            .as("%s should not repeat scenery ids", track.getId())
                            .isTrue();
                    assertThat(sceneryObject.path("kind").asText())
                            .doesNotEndWith("-landmark");
                    assertThat(sceneryObject.path("position").path("x").isNumber()).isTrue();
                    assertThat(sceneryObject.path("position").path("y").isNumber()).isTrue();
                    assertThat(sceneryObject.path("rotation").isNumber()).isTrue();
                    assertThat(sceneryObject.path("scale").asDouble()).isPositive();
                }
            }
            assertThat(scenerySignatures.add(sceneryLayout.path("landmarks").toString()))
                    .as("%s should have a circuit-specific landmark profile", track.getId())
                    .isTrue();
            assertThat(definition.path("source").path("environmentReferences").size()).isGreaterThanOrEqualTo(2);

            JsonNode curbs = definition.path("curbs");
            assertThat(curbs.isArray()).isTrue();
            assertThat(curbs).isNotEmpty();
            for (int index = 0; index < curbs.size(); index++) {
                JsonNode curb = curbs.get(index);
                assertThat(curb.path("index").asInt()).isEqualTo(index);
                assertThat(curb.path("fromDistanceMeters").asDouble()).isGreaterThanOrEqualTo(0);
                assertThat(curb.path("toDistanceMeters").asDouble())
                        .isGreaterThan(curb.path("fromDistanceMeters").asDouble())
                        .isLessThanOrEqualTo(track.getLengthMeters());
                assertThat(curb.path("side").asText()).isIn("left", "right");
            }

            JsonNode limitSegments = definition.path("trackLimits").path("segments");
            assertThat(limitSegments.isArray()).isTrue();
            assertThat(limitSegments).isNotEmpty();
            assertThat(limitSegments.get(0).path("fromDistanceMeters").asDouble()).isZero();
            assertThat(limitSegments.get(limitSegments.size() - 1).path("toDistanceMeters").asDouble())
                    .isCloseTo(track.getLengthMeters(), within(0.001));
            for (JsonNode segment : limitSegments) {
                foundOptionalFence |= assertValidSideEnvironment(segment.path("left"));
                foundOptionalFence |= assertValidSideEnvironment(segment.path("right"));
            }
        }
        assertThat(foundOptionalFence)
                .as("the canonical catalog should exercise the optional debris-fence layer")
                .isTrue();
        assertThat(scenerySignatures).hasSize(24);
    }

    @Test
    void shouldExposeAuditedUrbanAndPermanentCircuitEnvironments() throws Exception {
        mockMvc.perform(get("/api/tracks/monaco"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sceneryLayout.landmarks[0].kind").value("marina"))
                .andExpect(jsonPath("$.sceneryLayout.landmarks[2].kind").value("tunnel-building"))
                .andExpect(jsonPath("$.trackLimits.segments[0].left.zones").isArray())
                .andExpect(jsonPath("$.trackLimits.segments[0].left.barrier").isString())
                .andExpect(jsonPath("$.source.environmentReferences").isArray())
                .andExpect(jsonPath("$.source.environmentReferences.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(2)));

        mockMvc.perform(get("/api/tracks/interlagos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trackLimits.segments.length()").value(org.hamcrest.Matchers.greaterThan(1)))
                .andExpect(jsonPath("$.trackLimits.segments[0].right.zones").isArray());

        mockMvc.perform(get("/api/tracks/suzuka"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sceneryLayout.landmarks[0].kind").value("ferris-wheel"))
                .andExpect(jsonPath("$.centerline[?(@.elevationLayer == 1)]").isNotEmpty());

        mockMvc.perform(get("/api/tracks/lusail"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Lusail International Circuit"))
                .andExpect(jsonPath("$.lengthMeters").value(5419));
    }

    @Test
    void shouldPreserveDocumentedFullAndPartialDebrisFenceCoverage() throws Exception {
        assertCompleteFenceCoverage("miami");
        assertCompleteFenceCoverage("las-vegas");

        assertPartialFenceCoverage("jeddah");
        assertPartialFenceCoverage("baku");
        assertPartialFenceCoverage("lusail");
    }

    @Test
    void shouldLoadAShortAndALongTrackDefinitionWithoutAuthentication() throws Exception {
        mockMvc.perform(get("/api/tracks/monaco"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("monaco"))
                .andExpect(jsonPath("$.lengthMeters").value(3337))
                .andExpect(jsonPath("$.checkpoints.length()").value(8));

        mockMvc.perform(get("/api/tracks/spa-francorchamps"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("spa-francorchamps"))
                .andExpect(jsonPath("$.lengthMeters").value(7004))
                .andExpect(jsonPath("$.gridSlots.length()").value(4));
    }

    @Test
    void shouldRejectAnUnknownTrackDefinition() throws Exception {
        mockMvc.perform(get("/api/tracks/not-a-track"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("track_not_found"));
    }

    private boolean assertValidSideEnvironment(JsonNode side) {
        assertThat(side.path("zones").isArray()).isTrue();
        assertThat(side.path("zones").size()).isLessThanOrEqualTo(4);
        assertThat(side.path("barrier").isTextual()).isTrue();
        assertThat(side.path("barrier").asText()).isIn(BARRIER_TYPES);

        if (!side.has("fence")) {
            return false;
        }
        assertThat(side.path("fence").isTextual()).isTrue();
        assertThat(side.path("fence").asText()).isEqualTo(FENCE_TYPE);
        return true;
    }

    private void assertCompleteFenceCoverage(String trackId) throws Exception {
        int[] coverage = fenceCoverage(trackId);
        assertThat(coverage[0])
                .as("%s should have documented debris fencing on every modeled side", trackId)
                .isEqualTo(coverage[1]);
    }

    private void assertPartialFenceCoverage(String trackId) throws Exception {
        int[] coverage = fenceCoverage(trackId);
        assertThat(coverage[0])
                .as("%s should include its documented debris-fence sectors", trackId)
                .isPositive();
        assertThat(coverage[0])
                .as("%s should not overstate partial evidence as full-circuit coverage", trackId)
                .isLessThan(coverage[1]);
    }

    private int[] fenceCoverage(String trackId) throws Exception {
        Track track = trackRepository.findById(trackId).orElseThrow();
        JsonNode segments = objectMapper.readTree(track.getDefinitionJson())
                .path("trackLimits")
                .path("segments");
        int fencedSides = 0;
        int totalSides = 0;
        for (JsonNode segment : segments) {
            for (String sideName : Set.of("left", "right")) {
                totalSides++;
                if (FENCE_TYPE.equals(segment.path(sideName).path("fence").asText())) {
                    fencedSides++;
                }
            }
        }
        return new int[] { fencedSides, totalSides };
    }
}
