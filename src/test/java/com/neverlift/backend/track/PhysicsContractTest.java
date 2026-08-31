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
    void shouldPackageTheSingleF1FixedHandlingAndCumulativeDamageContractInTheV1Line()
            throws Exception {
        JsonNode constants = readContract("physics-constants.json");
        JsonNode decisions = readContract("module-2-decisions.json");
        JsonNode referenceScenarios = readContract("physics-reference-scenarios.json");

        assertThat(constants.path("version").asText()).isEqualTo("1.3.0");
        assertThat(decisions.path("contractVersion").asText()).isEqualTo("1.3.0");
        assertThat(decisions.path("localDamage").asText())
                .isEqualTo("deterministic-mechanical");
        assertThat(decisions.path("vehiclePolicy").asText())
                .isEqualTo("single-f1-paint-only");
        assertThat(decisions.path("handlingPolicy").asText())
                .isEqualTo("single-fixed-normal-values");
        assertThat(referenceScenarios.path("physicsConstantsVersion").asText())
                .isEqualTo("1.3.0");

        JsonNode vehiclePerformance = constants.path("vehiclePerformance");
        assertThat(vehiclePerformance.path("massKg").asDouble()).isEqualTo(800.0);
        assertThat(vehiclePerformance.path("collisionRadiusMeters").asDouble()).isEqualTo(1.24);
        assertThat(constants.path("vehicleVisual").path("lengthMeters").asDouble())
                .isEqualTo(5.6);
        assertThat(constants.path("vehicleVisual").path("widthMeters").asDouble())
                .isEqualTo(2.0);
        assertThat(constants.path("handling").path("lateralGripMultiplier").asDouble())
                .isEqualTo(1.0);
        assertThat(constants.path("handling").path("longitudinalGripMultiplier").asDouble())
                .isEqualTo(1.0);
        assertThat(constants.path("handling").path("steeringMultiplier").asDouble())
                .isEqualTo(1.0);
        assertThat(constants.path("handling").path("yawDampingPerSecond").asDouble())
                .isEqualTo(5.5);
        assertThat(constants.has("vehicleVisualProfiles")).isFalse();
        assertThat(constants.has("handlingModes")).isFalse();
        assertThat(constants.has("vehicleProfiles")).isFalse();

        for (JsonNode scenario : referenceScenarios.path("scenarios")) {
            assertThat(scenario.has("vehicleProfile")).isFalse();
            assertThat(scenario.has("handlingMode")).isFalse();
        }

        JsonNode thresholds = constants.path("damage").path("thresholds");
        assertThat(thresholds.path("minimumImpactSpeed").asDouble()).isEqualTo(4.0);
        assertThat(thresholds.path("mediumImpactSpeed").asDouble()).isEqualTo(9.0);
        assertThat(thresholds.path("combinedImpactSpeed").asDouble()).isEqualTo(14.0);
        assertThat(thresholds.path("totalLossImpactSpeed").asDouble()).isEqualTo(18.0);
        assertThat(thresholds.path("maximumHealth").asDouble()).isEqualTo(100.0);
        assertThat(thresholds.path("healthDamagePerImpactSpeed").asDouble()).isEqualTo(2.25);

        JsonNode effects = constants.path("damage").path("effects");
        assertThat(effects.path("engineAccelerationMultiplier").asDouble()).isEqualTo(0.82);
        assertThat(effects.path("engineMaxSpeedMultiplier").asDouble()).isEqualTo(0.9);
        assertThat(effects.path("steeringPullStrength").asDouble()).isEqualTo(0.1);
        assertThat(effects.path("totalLossDragMultiplier").asDouble()).isEqualTo(3.0);
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
