package com.neverlift.backend.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = "app.version=module-3a-test")
@AutoConfigureMockMvc
class RoomIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void shouldCreateListJoinAndIssueOneUseConnectionTicket() throws Exception {
        String hostToken = registerToken("room-host-" + UUID.randomUUID());
        String guestToken = registerToken("room-driver-" + UUID.randomUUID());
        String roomJson = mockMvc.perform(post("/api/rooms")
                        .header(HttpHeaders.AUTHORIZATION, bearer(hostToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", "Sprint Lobby", "gridSize", 2,
                                "password", "secret6"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(startsWith("")))
                .andExpect(jsonPath("$.limit").value(2))
                .andExpect(jsonPath("$.participantCount").value(1))
                .andExpect(jsonPath("$.hasPassword").value(true))
                .andExpect(jsonPath("$.settings.trackCatalogVersion").value("2026.12"))
                .andReturn().getResponse().getContentAsString();
        String roomCode = objectMapper.readTree(roomJson).get("code").asText();

        mockMvc.perform(get("/api/rooms").header(HttpHeaders.AUTHORIZATION, bearer(hostToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == '" + roomCode + "')].name").value("Sprint Lobby"));

        mockMvc.perform(post("/api/rooms/{code}/join", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(guestToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("password", "wrong"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("room_join_failed"))
                .andExpect(jsonPath("$.message").value("Unable to join that room"));

        mockMvc.perform(post("/api/rooms/{code}/join", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(guestToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("password", "secret6"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.participantCount").value(2));

        MvcResult ticketResult = mockMvc.perform(post("/api/rooms/{code}/connection-ticket", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(guestToken)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.ticket").exists())
                .andExpect(jsonPath("$.roomCode").value(roomCode))
                .andReturn();
        String ticket = objectMapper.readTree(ticketResult.getResponse().getContentAsString()).get("ticket").asText();

        mockMvc.perform(post("/api/rooms/{code}/connection-ticket", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(guestToken)))
                .andExpect(status().isCreated());
        assertThat(ticket).hasSize(32);
    }

    @Test
    void shouldRateLimitWrongJoinAttemptsAndKeepSettingsEditableAfterReady() throws Exception {
        String hostToken = registerToken("ready-host-" + UUID.randomUUID());
        String secondToken = registerToken("ready-driver-" + UUID.randomUUID());
        String roomJson = mockMvc.perform(post("/api/rooms")
                        .header(HttpHeaders.AUTHORIZATION, bearer(hostToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("gridSize", 2, "password", "secret6"))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String roomCode = objectMapper.readTree(roomJson).get("code").asText();

        for (int attempt = 0; attempt < 5; attempt++) {
            mockMvc.perform(post("/api/rooms/{code}/join", roomCode)
                            .header(HttpHeaders.AUTHORIZATION, bearer(secondToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("password", "wrong"))))
                    .andExpect(status().isNotFound());
        }
        mockMvc.perform(post("/api/rooms/{code}/join", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(secondToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("password", "secret6"))))
                .andExpect(status().isTooManyRequests());

        mockMvc.perform(post("/api/rooms/{code}/join", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(secondToken))
                        .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("password", "secret6"))))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/rooms/{code}/ready", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(hostToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settingsLocked").value(false));
        mockMvc.perform(patch("/api/rooms/{code}/settings", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(hostToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("gridSize", 3))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limit").value(3))
                .andExpect(jsonPath("$.settingsLocked").value(false))
                .andExpect(jsonPath("$.players[0].ready").value(true));

        mockMvc.perform(post("/api/rooms/{code}/ready", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(secondToken)))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/rooms/{code}/start", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(hostToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("qualifying"));
    }

    @Test
    void shouldAllowHostAndPlayerToLeaveAfterTheLobbyStarts() throws Exception {
        String hostToken = registerToken("leave-host-" + UUID.randomUUID());
        String secondToken = registerToken("leave-driver-" + UUID.randomUUID());
        String roomJson = mockMvc.perform(post("/api/rooms")
                        .header(HttpHeaders.AUTHORIZATION, bearer(hostToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("gridSize", 2))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String roomCode = objectMapper.readTree(roomJson).get("code").asText();

        mockMvc.perform(post("/api/rooms/{code}/join", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(secondToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/rooms/{code}/ready", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(hostToken)))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/rooms/{code}/ready", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(secondToken)))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/rooms/{code}/start", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(hostToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("qualifying"));

        mockMvc.perform(post("/api/rooms/{code}/leave", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(hostToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.participantCount").value(1))
                .andExpect(jsonPath("$.players[0].ready").value(true));
        mockMvc.perform(post("/api/rooms/{code}/leave", roomCode)
                        .header(HttpHeaders.AUTHORIZATION, bearer(secondToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.participantCount").value(0))
                .andExpect(jsonPath("$.hostId").doesNotExist());
    }

    @Test
    void shouldAllowAuthenticatedGuestInRoomEndpoints() throws Exception {
        String guestToken = tokenFrom(mockMvc.perform(post("/api/auth/guest"))
                .andExpect(status().isOk()).andReturn());
        mockMvc.perform(get("/api/rooms").header(HttpHeaders.AUTHORIZATION, bearer(guestToken)))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/rooms")
                        .header(HttpHeaders.AUTHORIZATION, bearer(guestToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", "Guest room"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Guest room"));
    }

    private String registerToken(String gamertag) throws Exception {
        return tokenFrom(mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("gamertag", gamertag, "displayName", gamertag, "password", "p@ss"))))
                .andExpect(status().isCreated()).andReturn());
    }

    private String tokenFrom(MvcResult result) throws Exception {
        return objectMapper.readValue(result.getResponse().getContentAsString(),
                new TypeReference<Map<String, Object>>() { }).get("token").toString();
    }

    private String json(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
