package com.neverlift.backend.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "CORS_ALLOWED_ORIGIN=https://legacy-frontend.neverlift.example",
        "app.version=module-0-cors-legacy-test"
})
@AutoConfigureMockMvc
class WebCorsLegacyConfigurationIntegrationTest {

    private static final String LEGACY_ORIGIN = "https://legacy-frontend.neverlift.example";

    @Autowired
    private MockMvc mockMvc;

    @Test
    void shouldKeepSupportingTheLegacySingleOriginVariable() throws Exception {
        mockMvc.perform(options("/api/health")
                        .header(HttpHeaders.ORIGIN, LEGACY_ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, LEGACY_ORIGIN));
    }
}
