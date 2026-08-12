package com.neverlift.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import javax.crypto.spec.SecretKeySpec;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.OctetSequenceKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.neverlift.backend.user.User;
import com.neverlift.backend.user.UserRepository;

@SpringBootTest(properties = "app.version=module-1-test")
@AutoConfigureMockMvc
class AuthenticationIntegrationTest {

    private static final String USER_PASSWORD = "p@ss";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtDecoder jwtDecoder;

    @BeforeEach
    void cleanDatabase() {
        userRepository.deleteAll();
    }

    @Test
    void shouldRegisterUserWithBCryptPasswordAndReturnUserToken() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "gamertag", "speedster",
                                "displayName", "Speed Ster",
                                "password", USER_PASSWORD))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token", startsWith("eyJ")))
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresIn").value(3600))
                .andExpect(jsonPath("$.role").value("user"))
                .andReturn();

        String token = tokenFrom(result);
        assertThat(token).hasSizeGreaterThan(50);

        Jwt jwt = jwtDecoder.decode(token);
        assertThat(jwt.getClaimAsString("role")).isEqualTo("user");
        assertThat(jwt.getClaimAsString("iss")).isEqualTo("never-lift-backend");
        assertThat(jwt.getExpiresAt()).isAfter(jwt.getIssuedAt());
        assertThat(jwt.getExpiresAt().getEpochSecond() - jwt.getIssuedAt().getEpochSecond())
                .isEqualTo(3600);

        User storedUser = userRepository.findByGamertag("speedster").orElseThrow();
        assertThat(storedUser.getPasswordHash())
                .startsWith("$2")
                .doesNotContain(USER_PASSWORD);
        assertThat(passwordEncoder.matches(USER_PASSWORD, storedUser.getPasswordHash())).isTrue();
    }

    @Test
    void shouldRejectDuplicateGamertagWithoutCreatingAnotherUser() throws Exception {
        register("duplicate", "First Driver", USER_PASSWORD);

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "gamertag", "duplicate",
                                "displayName", "Second Driver",
                                "password", "next"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("gamertag_taken"));

        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldValidateGamertagAndPasswordRules() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "gamertag", "has space",
                                "displayName", "Invalid",
                                "password", "a bc"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.fieldErrors.gamertag").exists())
                .andExpect(jsonPath("$.fieldErrors.password").exists());

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "gamertag", "short-password",
                                "displayName", "Invalid",
                                "password", "abc"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.fieldErrors.password").exists());

        assertThat(userRepository.count()).isZero();
    }

    @Test
    void shouldLoginAndRejectWrongPassword() throws Exception {
        register("login-driver", "Login Driver", USER_PASSWORD);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("gamertag", "login-driver", "password", USER_PASSWORD))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", startsWith("eyJ")))
                .andExpect(jsonPath("$.role").value("user"));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("gamertag", "login-driver", "password", "wrong"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("invalid_credentials"));
    }

    @Test
    void shouldIssueGuestTokenWithoutPersistingUser() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", startsWith("eyJ")))
                .andExpect(jsonPath("$.role").value("guest"))
                .andExpect(jsonPath("$.subject").exists())
                .andReturn();

        assertThat(tokenFrom(result)).hasSizeGreaterThan(50);
        Jwt jwt = jwtDecoder.decode(tokenFrom(result));
        assertThat(jwt.getClaimAsString("role")).isEqualTo("guest");
        assertThat(UUID.fromString(jwt.getSubject())).isNotNull();
        assertThat(userRepository.count()).isZero();
    }

    @Test
    void shouldGetAndUpdateAuthenticatedAccount() throws Exception {
        String token = register("account-driver", "Account Driver", USER_PASSWORD);

        mockMvc.perform(get("/api/account/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gamertag").value("account-driver"))
                .andExpect(jsonPath("$.displayName").value("Account Driver"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        mockMvc.perform(patch("/api/account/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "currentPassword", USER_PASSWORD,
                                "displayName", "Updated Driver",
                                "avatarId", "avatar-07",
                                "password", "n€w!"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Updated Driver"))
                .andExpect(jsonPath("$.avatarId").value("avatar-07"));

        User storedUser = userRepository.findByGamertag("account-driver").orElseThrow();
        assertThat(passwordEncoder.matches("n€w!", storedUser.getPasswordHash())).isTrue();
    }

    @Test
    void shouldRejectUpdateWithWrongCurrentPasswordWithoutChangingAccount() throws Exception {
        String token = register("safe-update", "Original Name", USER_PASSWORD);

        mockMvc.perform(patch("/api/account/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "currentPassword", "wrong",
                                "displayName", "Changed Name",
                                "password", "next"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("invalid_current_password"));

        User storedUser = userRepository.findByGamertag("safe-update").orElseThrow();
        assertThat(storedUser.getDisplayName()).isEqualTo("Original Name");
        assertThat(passwordEncoder.matches(USER_PASSWORD, storedUser.getPasswordHash())).isTrue();
    }

    @Test
    void shouldDeleteAccountAndRejectWrongCurrentPasswordWithoutDeleting() throws Exception {
        String token = register("delete-driver", "Delete Driver", USER_PASSWORD);

        mockMvc.perform(delete("/api/account/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("currentPassword", "wrong"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("invalid_current_password"));
        assertThat(userRepository.existsByGamertag("delete-driver")).isTrue();

        mockMvc.perform(delete("/api/account/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("currentPassword", USER_PASSWORD))))
                .andExpect(status().isNoContent());
        assertThat(userRepository.existsByGamertag("delete-driver")).isFalse();
    }

    @Test
    void shouldRejectGuestAndMissingTokenFromAccountEndpoints() throws Exception {
        String guestToken = guestToken();

        mockMvc.perform(get("/api/account/me").header(HttpHeaders.AUTHORIZATION, bearer(guestToken)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("access_denied"));

        mockMvc.perform(get("/api/account/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("authentication_required"));
    }

    @Test
    void shouldRejectExpiredToken() throws Exception {
        String expiredToken = expiredUserToken();

        mockMvc.perform(get("/api/account/me").header(HttpHeaders.AUTHORIZATION, bearer(expiredToken)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("invalid_token"));
    }

    private String register(String gamertag, String displayName, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "gamertag", gamertag,
                                "displayName", displayName,
                                "password", password))))
                .andExpect(status().isCreated())
                .andReturn();
        return tokenFrom(result);
    }

    private String guestToken() throws Exception {
        return tokenFrom(mockMvc.perform(post("/api/auth/guest"))
                .andExpect(status().isOk())
                .andReturn());
    }

    private String expiredUserToken() {
        byte[] keyBytes = "test-only-jwt-secret-with-at-least-thirty-two-bytes"
                .getBytes(StandardCharsets.UTF_8);
        OctetSequenceKey key = new OctetSequenceKey.Builder(keyBytes).build();
        JwtEncoder encoder = new org.springframework.security.oauth2.jwt.NimbusJwtEncoder(
                new ImmutableJWKSet<>(new JWKSet(key)));
        Instant issuedAt = Instant.now().minusSeconds(120);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("never-lift-backend")
                .subject(UUID.randomUUID().toString())
                .issuedAt(issuedAt)
                .expiresAt(issuedAt.plusSeconds(30))
                .claim("role", "user")
                .build();
        return encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).type("JWT").build(),
                claims)).getTokenValue();
    }

    private String tokenFrom(MvcResult result) throws Exception {
        Map<String, Object> body = objectMapper.readValue(
                result.getResponse().getContentAsString(),
                new TypeReference<>() {
                });
        return body.get("token").toString();
    }

    private String json(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
