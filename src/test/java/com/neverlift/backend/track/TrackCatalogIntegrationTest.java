package com.neverlift.backend.track;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
                .andExpect(jsonPath("$.schemaVersion").value("1.1.0"))
                .andExpect(jsonPath("$.catalogVersion").value("2026.2"))
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

        for (Track track : trackRepository.findAll()) {
            JsonNode definition = objectMapper.readTree(track.getDefinitionJson());
            assertThat(definition.path("schemaVersion").asText()).isEqualTo("1.1.0");
            assertThat(definition.path("catalogVersion").asText()).isEqualTo("2026.2");
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
            assertThat(definition.path("sceneryLayout").isObject()).isTrue();
            assertThat(definition.path("trackLimits").path("runoffWidthMeters").asInt()).isEqualTo(10);

            JsonNode limitSegments = definition.path("trackLimits").path("segments");
            assertThat(limitSegments.isArray()).isTrue();
            assertThat(limitSegments).isNotEmpty();
            assertThat(limitSegments.get(0).path("fromDistanceMeters").asDouble()).isZero();
            assertThat(limitSegments.get(limitSegments.size() - 1).path("toDistanceMeters").asDouble())
                    .isCloseTo(track.getLengthMeters(), within(0.001));
        }
    }

    @Test
    void shouldExposeWalledAndMixedCircuitLimits() throws Exception {
        mockMvc.perform(get("/api/tracks/monaco"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trackLimits.runoffWidthMeters").value(10))
                .andExpect(jsonPath("$.trackLimits.segments.length()").value(1))
                .andExpect(jsonPath("$.trackLimits.segments[0].left").value("barrier"))
                .andExpect(jsonPath("$.trackLimits.segments[0].right").value("barrier"));

        mockMvc.perform(get("/api/tracks/interlagos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trackLimits.segments[0].left").value("barrier"))
                .andExpect(jsonPath("$.trackLimits.segments[1].left").value("runoff"))
                .andExpect(jsonPath("$.trackLimits.segments[1].right").value("runoff"));
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
}
