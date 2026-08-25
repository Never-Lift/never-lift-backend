package com.neverlift.backend.track;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class PhysicsContractV2Test {

    private static final String CONTRACT_ROOT = "contracts/module-2/v2/";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void shouldPackageTheExecutablePhysicsV2ContractWithoutBoost() throws Exception {
        JsonNode constants = readContract("physics-constants.json");
        JsonNode decisions = readContract("module-2-decisions.json");
        JsonNode scenarios = readContract("physics-reference-scenarios.json");
        JsonNode protocol = readContract("realtime-race-protocol.schema.json");

        assertThat(constants.path("version").asText()).isEqualTo("2.0.0");
        assertThat(constants.path("calibrationStatus").asText()).isEqualTo("initial");
        assertThat(constants.path("simulation").path("physicsStepSeconds").asDouble())
                .isEqualTo(1.0 / 120.0);
        assertThat(constants.path("simulation").path("serverPhysicsSubstepsPerTick").asInt())
                .isEqualTo(4);
        assertThat(constants.path("controls").path("brakeRisePerSecond").asDouble())
                .isEqualTo(12.0);
        assertThat(constants.path("controls").path("brakeFallPerSecond").asDouble())
                .isEqualTo(6.0);
        assertThat(constants.path("powertrain").path("gearRatios").size()).isEqualTo(8);
        assertThat(constants.path("powertrain").path("automaticUpshiftWheelSlipAllowance").asDouble())
                .isEqualTo(0.08);
        assertThat(constants.path("powertrain").path("maximumBrakeForceNewtons").asDouble())
                .isEqualTo(20_000.0);
        assertThat(constants.path("powertrain").path("frontBrakeBias").asDouble())
                .isEqualTo(0.6);
        assertThat(constants.path("powertrain").has("wheelAngularResponsePerSecond")).isFalse();
        assertThat(constants.path("powertrain").path("frontAxleRotationalInertiaKgM2").asDouble())
                .isEqualTo(5.184);
        assertThat(constants.path("powertrain").path("rearAxleRotationalInertiaKgM2").asDouble())
                .isEqualTo(5.8024);
        double wheelRadius = constants.path("vehicle").path("wheelRadiusMeters").asDouble();
        double inertiaFactor = constants.path("powertrain").path("wheelAssemblyInertiaFactor").asDouble();
        double derivedFrontInertia = 2
                * constants.path("powertrain").path("frontWheelAssemblyMassKg").asDouble()
                * wheelRadius * wheelRadius
                * inertiaFactor;
        double derivedRearInertia = 2
                * constants.path("powertrain").path("rearWheelAssemblyMassKg").asDouble()
                * wheelRadius * wheelRadius
                * inertiaFactor
                + constants.path("powertrain").path("rearDrivelineRotationalInertiaKgM2").asDouble();
        assertThat(derivedFrontInertia).isCloseTo(
                constants.path("powertrain").path("frontAxleRotationalInertiaKgM2").asDouble(),
                org.assertj.core.data.Offset.offset(1e-12));
        assertThat(derivedRearInertia).isCloseTo(
                constants.path("powertrain").path("rearAxleRotationalInertiaKgM2").asDouble(),
                org.assertj.core.data.Offset.offset(1e-12));
        double[] expectedRedlineSpeedsKph = {105, 140, 175, 210, 245, 280, 315, 350};
        double redlineRadiansPerSecond = constants.path("powertrain").path("redlineRpm").asDouble()
                * 2 * Math.PI / 60;
        JsonNode ratios = constants.path("powertrain").path("gearRatios");
        for (int index = 0; index < ratios.size(); index++) {
            double speedKph = redlineRadiansPerSecond * wheelRadius
                    / (ratios.get(index).asDouble()
                            * constants.path("powertrain").path("finalDriveRatio").asDouble())
                    * 3.6;
            assertThat(speedKph).isCloseTo(
                    expectedRedlineSpeedsKph[index],
                    org.assertj.core.data.Offset.offset(1.0));
        }
        assertThat(constants.path("tires").has("referenceAxleLoadNewtons")).isFalse();
        assertThat(constants.path("tires").has("combinedGripExponent")).isFalse();
        assertThat(constants.path("collision").path("maximumCcdEventsPerStep").asInt())
                .isEqualTo(4);
        assertThat(constants.path("collision").path("barrierMaterials").fieldNames())
                .toIterable()
                .containsExactlyInAnyOrder("concrete-wall", "guardrail", "tecpro", "tyre-barrier");
        assertThat(constants.path("collision").has("barrierRestitution")).isFalse();
        assertThat(constants.path("collision").has("tangentialFriction")).isFalse();
        assertThat(constants.path("environment").path("gravityMetersPerSecondSquared").asDouble())
                .isEqualTo(9.80665);

        assertThat(decisions.path("boostPolicy").asText()).isEqualTo("removed");
        assertThat(decisions.path("shiftKeyPolicy").asText()).isEqualTo("unassigned");
        assertThat(decisions.path("inputActions")).hasSize(3);
        assertThat(decisions.path("inputActions").toString())
                .isEqualTo("[\"throttle\",\"brake\",\"steer\"]");
        assertThat(protocol.toString()).doesNotContain("nitro", "boost");
        assertThat(protocol.toString()).doesNotContain("paintId");
        assertThat(protocol.toString()).contains("color", "#a84448", "#365f82", "#3f704f");
        assertThat(protocol.toString()).contains("physicsContractVersion");
        assertThat(scenarios.path("scenarios").size()).isGreaterThanOrEqualTo(10);
    }

    @Test
    void shouldUseOneMetricCompoundColliderConsistentWithPhysicsConstants() throws Exception {
        JsonNode constants = readContract("physics-constants.json");
        JsonNode vehicle = readContract("vehicle-definition.json");

        assertThat(vehicle.path("version").asText()).isEqualTo("2.0.0");
        assertThat(vehicle.path("dimensions").path("lengthMeters").asDouble())
                .isEqualTo(constants.path("vehicle").path("lengthMeters").asDouble());
        assertThat(vehicle.path("dimensions").path("widthMeters").asDouble())
                .isEqualTo(constants.path("vehicle").path("widthMeters").asDouble());
        assertThat(vehicle.path("dimensions").path("wheelbaseMeters").asDouble())
                .isEqualTo(constants.path("vehicle").path("wheelbaseMeters").asDouble());
        assertThat(vehicle.path("massProperties").path("yawInertiaKgM2").asDouble())
                .isEqualTo(constants.path("vehicle").path("yawInertiaKgM2").asDouble());

        JsonNode shapes = vehicle.path("collisionShapes");
        assertThat(shapes.size()).isEqualTo(22);
        Set<String> ids = new HashSet<>();
        for (JsonNode shape : shapes) {
            assertThat(ids.add(shape.path("id").asText())).isTrue();
            assertThat(shape.path("vertices").size()).isGreaterThanOrEqualTo(3);
            assertThat(signedArea(shape.path("vertices"))).isPositive();
        }
        assertThat(ids).contains(
                "front-wing-centre",
                "nose",
                "monocoque",
                "front-left-wheel",
                "rear-right-wheel",
                "rear-wing-left");
    }

    @Test
    void shouldKeepThePublishedV1ContractPackagedAsImmutableHistory() throws Exception {
        try (InputStream input = getClass().getClassLoader()
                .getResourceAsStream("contracts/module-2/v1/physics-constants.json")) {
            assertThat(input).isNotNull();
            assertThat(objectMapper.readTree(input).path("version").asText()).isEqualTo("1.3.0");
        }
    }

    private double signedArea(JsonNode vertices) {
        double doubledArea = 0;
        for (int index = 0; index < vertices.size(); index++) {
            JsonNode current = vertices.get(index);
            JsonNode next = vertices.get((index + 1) % vertices.size());
            doubledArea += current.path("x").asDouble() * next.path("y").asDouble()
                    - current.path("y").asDouble() * next.path("x").asDouble();
        }
        return doubledArea / 2;
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
