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

        assertThat(constants.path("version").asText()).isEqualTo("2.0.3");
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
        assertThat(constants.path("collision").path("maximumContactPoints").asInt())
                .isEqualTo(2);
        assertThat(constants.path("collision").path("ccdMaximumAngularArcStepMeters").asDouble())
                .isEqualTo(0.05);
        assertThat(constants.path("collision").path("ccdAngularPoseSamplesPerMaximumArcStep").asInt())
                .isEqualTo(4);
        assertThat(constants.path("collision").path("ccdTimeEpsilonSeconds").asDouble())
                .isEqualTo(1e-8);
        assertThat(constants.path("collision").path("ccdAngularMotionEpsilonRadians").asDouble())
                .isEqualTo(1e-8);
        assertThat(constants.path("collision").path("ccdTimeRefinementIterations").asInt())
                .isEqualTo(8);
        assertThat(constants.path("collision").path("contactPatchNormalVelocityMergeMetersPerSecond").asDouble())
                .isEqualTo(0.01);
        assertThat(constants.path("collision").path("barrierMaterials").fieldNames())
                .toIterable()
                .containsExactlyInAnyOrder("concrete-wall", "guardrail", "tecpro", "tyre-barrier");
        assertThat(constants.path("collision").has("barrierRestitution")).isFalse();
        assertThat(constants.path("collision").has("tangentialFriction")).isFalse();
        assertThat(constants.path("environment").path("gravityMetersPerSecondSquared").asDouble())
                .isEqualTo(9.80665);
        JsonNode damage = constants.path("damage");
        assertThat(damage.path("minimumDeltaVMetersPerSecond").asDouble()).isEqualTo(5.0);
        assertThat(damage.path("mediumDeltaVMetersPerSecond").asDouble()).isEqualTo(10.0);
        assertThat(damage.path("combinedDeltaVMetersPerSecond").asDouble()).isEqualTo(18.0);
        assertThat(damage.path("totalLossDeltaVMetersPerSecond").asDouble()).isEqualTo(30.0);
        assertThat(damage.path("healthDamagePerDeltaV").asDouble()).isEqualTo(1.5);
        assertThat(damage.path("steeringPullStrength").asDouble()).isEqualTo(0.005);

        assertThat(decisions.path("boostPolicy").asText()).isEqualTo("removed");
        assertThat(decisions.path("shiftKeyPolicy").asText()).isEqualTo("unassigned");
        assertThat(decisions.path("pitPolicy").asText())
                .isEqualTo("navigable-lane-garage-shell-collision");
        assertThat(decisions.path("garagePolicy").asText())
                .isEqualTo("22-opaque-bays-rear-barrier");
        assertThat(decisions.path("inputActions")).hasSize(3);
        assertThat(decisions.path("inputActions").toString())
                .isEqualTo("[\"throttle\",\"brake\",\"steer\"]");
        assertThat(protocol.toString()).doesNotContain("nitro", "boost");
        assertThat(protocol.toString()).doesNotContain("paintId");
        assertThat(protocol.toString()).contains("color", "#a84448", "#365f82", "#3f704f");
        assertThat(protocol.toString()).contains("physicsContractVersion");
        assertThat(protocol.at("/$defs/joinRoomEnvelope/properties/payload/properties/roomCode/pattern").asText())
                .isEqualTo("^[0-9]{4}$");
        assertThat(protocol.at("/$defs/readyEnvelope/properties/payload/required").toString())
                .contains("ready");
        assertThat(protocol.at("/$defs/roomStateEnvelope/properties/payload/required").toString())
                .contains("code", "name", "hostName", "participantCount", "limit")
                .doesNotContain("hasPassword");
        assertThat(protocol.at("/$defs/roomStateEnvelope/properties/payload/properties/players/maxItems").asInt())
                .isEqualTo(22);
        assertThat(protocol.at("/$defs/stateSnapshotEnvelope/properties/payload/properties/cars/maxItems").asInt())
                .isEqualTo(22);
        assertThat(protocol.at("/$defs/raceResultEnvelope/properties/payload/properties/standings/maxItems").asInt())
                .isEqualTo(22);
        assertThat(protocol.at("/$defs/standing/properties/position/maximum").asInt())
                .isEqualTo(22);
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
    void shouldPackageTheSharedBotPlannerConstants() throws Exception {
        JsonNode bots = readContract("physics-constants.json").path("bots");
        JsonNode planner = bots.path("planner");

        assertThat(planner.isObject()).isTrue();
        assertThat(planner.fieldNames()).toIterable().containsExactlyInAnyOrder(
                "steeringLookAheadBaseMeters",
                "steeringLookAheadSpeedSeconds",
                "steeringLookAheadReactionReferenceSeconds",
                "steeringLookAheadReactionGainMetersPerSecond",
                "steeringNoiseFrequencyRadiansPerSecond",
                "brakingLookAheadBaseMeters",
                "brakingLookAheadSpeedSeconds",
                "brakingLookAheadRecoveryGainSeconds",
                "brakingPreviewSampleCount",
                "racingLineSpeedFactorExponent",
                "terminalSpeedTargetMultiplier",
                "brakeHeadingErrorThresholdRadians",
                "maximumBrakeBase",
                "maximumBrakeRecoveryGain",
                "brakingRecoveryThrottle",
                "brakingTrackThrottle",
                "recoveryThrottleMultiplier",
                "trackThrottleMultiplier",
                "brakeDemandBase",
                "brakeDemandSpeedScaleMetersPerSecond",
                "steeringFullScaleHeadingErrorRadians");
        assertThat(planner.path("brakingPreviewSampleCount").asInt()).isEqualTo(6);
        assertThat(planner.path("maximumBrakeBase").asDouble()
                        + planner.path("maximumBrakeRecoveryGain").asDouble())
                .isLessThanOrEqualTo(1.0);
        for (String difficulty : Set.of("easy", "normal", "hard")) {
            JsonNode settings = bots.path(difficulty);
            assertThat(settings.fieldNames()).toIterable().containsExactlyInAnyOrder(
                    "paceMultiplier",
                    "brakingSafetyMultiplier",
                    "steeringNoise",
                    "steeringLookAheadPenaltySeconds",
                    "recoveryMultiplier");
            assertThat(settings.has("consistency")).isFalse();
            assertThat(settings.has("reactionDelaySeconds")).isFalse();
        }
        assertThat(bots.path("easy").path("steeringLookAheadPenaltySeconds").asDouble())
                .isEqualTo(0.3);
        assertThat(bots.path("normal").path("steeringLookAheadPenaltySeconds").asDouble())
                .isEqualTo(0.18);
        assertThat(bots.path("hard").path("steeringLookAheadPenaltySeconds").asDouble())
                .isEqualTo(0.08);
    }

    @Test
    void shouldPackageTheSharedRaceRuntimeConstants() throws Exception {
        JsonNode race = readContract("physics-constants.json").path("race");

        assertThat(race.fieldNames()).toIterable().containsExactlyInAnyOrder(
                "jumpStartThrottleThreshold",
                "jumpStartLockSeconds",
                "gridGapMeters",
                "checkpointGateMarginMeters",
                "pitSpeedLimitMetersPerSecond",
                "pitLaneHalfWidthMeters",
                "minimumRaceDurationSeconds",
                "raceDurationReferenceSpeedMetersPerSecond",
                "progressProjectionMarginMeters",
                "startLightCount",
                "startLightStageSeconds",
                "lightsOutDelaySeconds",
                "localProjectionWindowMeters",
                "localProjectionRecoveryMarginMeters",
                "projectionDistanceToleranceMeters",
                "barrierBroadphaseCellMeters");
        assertThat(race.path("pitLaneHalfWidthMeters").asDouble()).isEqualTo(3.0);
        assertThat(race.path("minimumRaceDurationSeconds").asDouble()).isEqualTo(180.0);
        assertThat(race.path("raceDurationReferenceSpeedMetersPerSecond").asDouble())
                .isEqualTo(12.0);
        assertThat(race.path("progressProjectionMarginMeters").asDouble()).isEqualTo(30.0);
        assertThat(race.path("startLightCount").asInt()).isEqualTo(5);
        assertThat(race.path("startLightStageSeconds").asDouble()).isEqualTo(1.0);
        assertThat(race.path("lightsOutDelaySeconds").asDouble()).isEqualTo(1.0);
        assertThat(race.path("localProjectionWindowMeters").asDouble()).isEqualTo(40.0);
        assertThat(race.path("localProjectionRecoveryMarginMeters").asDouble()).isEqualTo(24.0);
        assertThat(race.path("projectionDistanceToleranceMeters").asDouble()).isEqualTo(0.5);
        assertThat(race.path("barrierBroadphaseCellMeters").asDouble()).isEqualTo(64.0);
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
