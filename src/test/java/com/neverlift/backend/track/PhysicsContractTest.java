package com.neverlift.backend.track;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import org.junit.jupiter.api.Test;

class PhysicsContractTest {

    private static final String CONTRACT_ROOT = "contracts/module-2/v1/";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void shouldPackageTheMechanicalDamageContractInTheV1Line() throws Exception {
        JsonNode constants = readContract("physics-constants.json");
        JsonNode decisions = readContract("module-2-decisions.json");
        JsonNode referenceScenarios = readContract("physics-reference-scenarios.json");

        assertThat(constants.path("version").asText()).isEqualTo("1.1.0");
        assertThat(decisions.path("contractVersion").asText()).isEqualTo("1.1.0");
        assertThat(decisions.path("localDamage").asText())
                .isEqualTo("deterministic-mechanical");
        assertThat(referenceScenarios.path("physicsConstantsVersion").asText())
                .isEqualTo("1.1.0");

        JsonNode thresholds = constants.path("damage").path("thresholds");
        assertThat(thresholds.path("minimumImpactSpeed").asDouble()).isEqualTo(4.0);
        assertThat(thresholds.path("totalLossImpactSpeed").asDouble()).isEqualTo(18.0);
        assertThat(thresholds.path("accumulatedTotalLossPoints").asDouble()).isEqualTo(36.0);
        assertThat(thresholds.path("powertrainAlignment").asDouble()).isEqualTo(0.62);

        JsonNode effects = constants.path("damage").path("effects");
        assertThat(effects.path("engineAccelerationMultiplier").asDouble()).isEqualTo(0.45);
        assertThat(effects.path("engineMaxSpeedMultiplier").asDouble()).isEqualTo(0.65);
        assertThat(effects.path("steeringResponseMultiplier").asDouble()).isEqualTo(0.35);
        assertThat(effects.path("totalLossDragMultiplier").asDouble()).isEqualTo(4.0);
    }

    private JsonNode readContract(String fileName) throws IOException {
        String resourcePath = CONTRACT_ROOT + fileName;
        try (InputStream input = getClass().getClassLoader().getResourceAsStream(resourcePath)) {
            assertThat(input)
                    .as("classpath resource %s", resourcePath)
                    .isNotNull();
            return objectMapper.readTree(input);
        }
    }
}
