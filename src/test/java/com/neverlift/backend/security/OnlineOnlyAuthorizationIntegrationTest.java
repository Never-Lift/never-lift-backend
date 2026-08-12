package com.neverlift.backend.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.neverlift.backend.user.UserRepository;

@SpringBootTest(properties = "app.version=module-1-online-only-test")
@AutoConfigureMockMvc
@Import(OnlineOnlyAuthorizationIntegrationTest.OnlineOnlyTestConfiguration.class)
class OnlineOnlyAuthorizationIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @BeforeEach
    void cleanDatabase() {
        userRepository.deleteAll();
    }

    @Test
    void shouldAllowUserAndRejectGuestOnOnlineOnlyEndpoint() throws Exception {
        String userToken = registerUserToken();
        String guestToken = guestToken();

        mockMvc.perform(get("/api/test/online-only")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + userToken))
                .andExpect(status().isOk())
                .andExpect(content().string("online"));

        mockMvc.perform(get("/api/test/online-only")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + guestToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("access_denied"));
    }

    private String registerUserToken() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "gamertag", "online-user",
                "displayName", "Online User",
                "password", "p@ss"));
        return tokenFrom(mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    private String guestToken() throws Exception {
        return tokenFrom(mockMvc.perform(post("/api/auth/guest"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private String tokenFrom(String json) throws Exception {
        Map<String, Object> body = objectMapper.readValue(json, new TypeReference<>() {
        });
        return body.get("token").toString();
    }

    @TestConfiguration
    static class OnlineOnlyTestConfiguration {

        @Bean
        OnlineOnlyTestController onlineOnlyTestController() {
            return new OnlineOnlyTestController();
        }
    }

    @RestController
    @RequestMapping("/api/test")
    static class OnlineOnlyTestController {

        @GetMapping("/online-only")
        @OnlineOnly
        String onlineOnly() {
            return "online";
        }
    }
}
