package com.neverlift.backend.race;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.neverlift.backend.user.UserRepository;

@SpringBootTest(properties = "app.version=module-2-test")
@AutoConfigureMockMvc
class LocalRaceResultIntegrationTest {

    private static final String PASSWORD = "race";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RaceResultRepository raceResultRepository;

    @Autowired
    private UserRepository userRepository;

    @BeforeEach
    void cleanRaceData() {
        raceResultRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void shouldPersistOneResultPerEntryAndAssociateOnlyTheAuthenticatedUser() throws Exception {
        Session session = register("local-driver");
        List<Map<String, Object>> entries = List.of(
                entry(session.userId(), 1, 185_420, 61_100, true),
                entry(null, 2, 189_305, 62_450, true));

        mockMvc.perform(post("/api/races/local-result")
                        .header(HttpHeaders.AUTHORIZATION, bearer(session.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request("interlagos", "2026.6", "local", entries)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.persistedCount").value(2))
                .andExpect(jsonPath("$.resultIds.length()").value(2));

        List<RaceResult> stored = raceResultRepository.findAll();
        assertThat(stored).hasSize(2);
        assertThat(stored).extracting(RaceResult::getTrackId).containsOnly("interlagos");
        assertThat(stored).extracting(RaceResult::getTrackCatalogVersion).containsOnly("2026.6");
        assertThat(stored).extracting(RaceResult::getPhysicsContractVersion).containsOnly("2.0.0");
        assertThat(stored).extracting(RaceResult::getMode).containsOnly(RaceMode.LOCAL);
        assertThat(stored).extracting(RaceResult::getPosition).containsExactlyInAnyOrder(1, 2);
        assertThat(stored).extracting(RaceResult::getUserId)
                .containsExactlyInAnyOrder(session.userId(), null);
        assertThat(stored).allMatch(result -> result.getCreatedAt() != null);
    }

    @Test
    void shouldPersistGuestResultsWithoutAnAccountAssociation() throws Exception {
        String guestToken = guestToken();

        mockMvc.perform(post("/api/races/local-result")
                        .header(HttpHeaders.AUTHORIZATION, bearer(guestToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request(
                                "monaco",
                                "2026.6",
                                "solo",
                                List.of(entry(null, 1, 205_000, 68_000, true)))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.persistedCount").value(1));

        RaceResult stored = raceResultRepository.findAll().getFirst();
        assertThat(stored.getUserId()).isNull();
        assertThat(stored.getMode()).isEqualTo(RaceMode.SOLO);
        assertThat(userRepository.count()).isZero();
    }

    @Test
    void shouldRejectMissingAuthenticationAndInvalidModeWithoutPersisting() throws Exception {
        String body = request(
                "monaco",
                "2026.6",
                "online",
                List.of(entry(null, 1, 205_000, 68_000, true)));

        mockMvc.perform(post("/api/races/local-result")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("authentication_required"));

        mockMvc.perform(post("/api/races/local-result")
                        .header(HttpHeaders.AUTHORIZATION, bearer(guestToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.fieldErrors.mode").exists());

        assertThat(raceResultRepository.count()).isZero();
    }

    @Test
    void shouldRejectUnknownTrackAndCatalogVersionMismatch() throws Exception {
        Session session = register("catalog-driver");
        List<Map<String, Object>> entries = List.of(
                entry(session.userId(), 1, 185_420, 61_100, true));

        mockMvc.perform(post("/api/races/local-result")
                        .header(HttpHeaders.AUTHORIZATION, bearer(session.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request("unknown", "2026.6", "solo", entries)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("track_not_found"));

        mockMvc.perform(post("/api/races/local-result")
                        .header(HttpHeaders.AUTHORIZATION, bearer(session.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request("monaco", "2025.9", "solo", entries)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("catalog_version_mismatch"));

        assertThat(raceResultRepository.count()).isZero();
    }

    @Test
    void shouldRejectMissingOrIncompatiblePhysicsContractVersion() throws Exception {
        Session session = register("physics-version-driver");
        List<Map<String, Object>> entries = List.of(
                entry(session.userId(), 1, 185_420, 61_100, true));

        Map<String, Object> missingVersion = new LinkedHashMap<>();
        missingVersion.put("trackId", "interlagos");
        missingVersion.put("trackCatalogVersion", "2026.6");
        missingVersion.put("mode", "solo");
        missingVersion.put("results", entries);
        mockMvc.perform(post("/api/races/local-result")
                        .header(HttpHeaders.AUTHORIZATION, bearer(session.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(missingVersion)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.fieldErrors.physicsContractVersion").exists());

        Map<String, Object> incompatibleVersion = new LinkedHashMap<>(missingVersion);
        incompatibleVersion.put("physicsContractVersion", "1.3.0");
        mockMvc.perform(post("/api/races/local-result")
                        .header(HttpHeaders.AUTHORIZATION, bearer(session.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(incompatibleVersion)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("physics_contract_version_mismatch"));

        assertThat(raceResultRepository.count()).isZero();
    }

    @Test
    void shouldRejectAnotherUserIdentityForUserAndGuestTokens() throws Exception {
        Session owner = register("identity-owner");
        Session other = register("identity-other");
        String spoofedBody = request(
                "monaco",
                "2026.6",
                "solo",
                List.of(entry(other.userId(), 1, 205_000, 68_000, true)));

        mockMvc.perform(post("/api/races/local-result")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(spoofedBody))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("result_identity_mismatch"));

        mockMvc.perform(post("/api/races/local-result")
                        .header(HttpHeaders.AUTHORIZATION, bearer(guestToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(spoofedBody))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("result_identity_mismatch"));

        assertThat(raceResultRepository.count()).isZero();
    }

    @Test
    void shouldRejectInvalidPositionsAndTimesAtomically() throws Exception {
        Session session = register("validation-driver");
        List<Map<String, Object>> duplicatePositions = List.of(
                entry(session.userId(), 1, 185_420, 61_100, true),
                entry(null, 1, 189_305, 62_450, true));

        mockMvc.perform(post("/api/races/local-result")
                        .header(HttpHeaders.AUTHORIZATION, bearer(session.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request("interlagos", "2026.6", "local", duplicatePositions)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_positions"));

        mockMvc.perform(post("/api/races/local-result")
                        .header(HttpHeaders.AUTHORIZATION, bearer(session.token()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request(
                                "interlagos",
                                "2026.6",
                                "solo",
                                List.of(entry(session.userId(), 1, 50_000, 60_000, true)))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_best_lap_time"));

        assertThat(raceResultRepository.count()).isZero();
    }

    private Session register(String gamertag) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "gamertag", gamertag,
                                "displayName", gamertag,
                                "password", PASSWORD))))
                .andExpect(status().isCreated())
                .andReturn();
        Map<String, Object> response = objectMapper.readValue(
                result.getResponse().getContentAsString(),
                new TypeReference<>() {
                });
        return new Session(
                response.get("token").toString(),
                UUID.fromString(response.get("subject").toString()));
    }

    private String guestToken() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest"))
                .andExpect(status().isOk())
                .andReturn();
        Map<String, Object> response = objectMapper.readValue(
                result.getResponse().getContentAsString(),
                new TypeReference<>() {
                });
        return response.get("token").toString();
    }

    private String request(
            String trackId,
            String catalogVersion,
            String mode,
            List<Map<String, Object>> entries) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "trackId", trackId,
                "trackCatalogVersion", catalogVersion,
                "physicsContractVersion", "2.0.0",
                "mode", mode,
                "results", entries));
    }

    private Map<String, Object> entry(
            UUID userId,
            int position,
            long totalTimeMs,
            long bestLapTimeMs,
            boolean finished) {
        Map<String, Object> entry = new LinkedHashMap<>();
        if (userId != null) {
            entry.put("userIdOrNull", userId);
        }
        entry.put("position", position);
        entry.put("totalTimeMs", totalTimeMs);
        entry.put("bestLapTimeMs", bestLapTimeMs);
        entry.put("finished", finished);
        return entry;
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private record Session(String token, UUID userId) {
    }
}
