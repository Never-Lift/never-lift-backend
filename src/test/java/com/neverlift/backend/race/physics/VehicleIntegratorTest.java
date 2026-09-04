package com.neverlift.backend.race.physics;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.DynamicTest;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;
import static org.assertj.core.api.Assertions.*;

class VehicleIntegratorTest {
    final PhysicsContract contract = new PhysicsContract();
    final VehicleIntegrator integrator = new VehicleIntegrator(contract);
    final JsonNode references = PhysicsContract.resource("physics-reference-scenarios.json");

    @TestFactory
    Stream<DynamicTest> reproducesEveryTypeScriptScenario() throws Exception {
        JsonNode golden;
        try (var stream = getClass().getResourceAsStream("/physics/typescript-reference-2.0.2.json")) {
            golden = new ObjectMapper().readTree(stream);
        }
        assertThat(golden.path("physicsContractVersion").asText()).isEqualTo(contract.version());
        return StreamSupport.stream(references.path("scenarios").spliterator(), false)
                .map(scenario -> DynamicTest.dynamicTest(scenario.path("id").asText(), () -> {
                    JsonNode expectedScenario = StreamSupport.stream(golden.path("scenarios").spliterator(), false)
                            .filter(candidate -> candidate.path("id").equals(scenario.path("id"))).findFirst().orElseThrow();
                    VehicleState state = new VehicleState("physics-reference", contract);
                    VehicleCollisions collisions = new VehicleCollisions(contract);
                    List<CollisionGeometry.Shape> barriers = new ArrayList<>();
                    if (scenario.has("environment")) {
                        var barrier = scenario.path("environment").path("barrier");
                        Vec2 from = new Vec2(barrier.path("from").path("x").doubleValue(), barrier.path("from").path("y").doubleValue());
                        Vec2 to = new Vec2(barrier.path("to").path("x").doubleValue(), barrier.path("to").path("y").doubleValue());
                        barriers.add(new CollisionGeometry.Shape("reference-" + barrier.path("material").asText(), barrier.path("material").asText(),
                                List.of(from, to, to.add(new Vec2(0.4, 0)), from.add(new Vec2(0.4, 0)))));
                    }
                    var fields = scenario.path("initialState").fields();
                    while (fields.hasNext()) {
                        var field = fields.next();
                        if (field.getKey().equals("gear")) state.gear = field.getValue().intValue();
                        else VehicleState.class.getField(field.getKey()).setDouble(state, field.getValue().doubleValue());
                    }
                    int checkpoint = 0;
                    for (int step = 0; step < scenario.path("steps").intValue(); step++) {
                        DriverInput input = DriverInput.NEUTRAL;
                        for (JsonNode segment : scenario.path("inputSegments")) {
                            if (step >= segment.path("fromStep").intValue() && step < segment.path("toStep").intValue()) {
                                JsonNode command = segment.path("input");
                                input = new DriverInput(command.path("throttle").doubleValue(), command.path("brake").doubleValue(), command.path("steer").doubleValue());
                            }
                        }
                        integrator.integrate(state, input, scenario.path("surface").asText());
                        if (!barriers.isEmpty()) collisions.againstBarriers(state, contract.stepSeconds(), ignored -> barriers, integrator::recordNormalImpact);
                        JsonNode expected = expectedScenario.path("states").get(checkpoint);
                        if (expected != null && expected.path("step").intValue() == step + 1) {
                            assertState(state, expected.path("state"), step + 1);
                            checkpoint++;
                        }
                    }
                    assertThat(checkpoint).isEqualTo(expectedScenario.path("states").size());
                }));
    }
    void assertState(VehicleState state, JsonNode expected, int step) throws Exception {
        var fields = expected.fields();
        while (fields.hasNext()) {
            var field = fields.next();
            String key = field.getKey();
            if (key.equals("damageState")) {
                JsonNode actualDamage = new ObjectMapper().valueToTree(state.damageState);
                assertThat(actualDamage.equals((a, b) -> a.isNumber() && b.isNumber()
                        ? Double.compare(a.doubleValue(), b.doubleValue()) : a.equals(b) ? 0 : 1, field.getValue()))
                        .as("damage at step %s", step).isTrue();
                continue;
            }
            double actual = ((Number) VehicleState.class.getField(key).get(state)).doubleValue();
            if (Boolean.getBoolean("physics.parity.diagnostics") && step <= 60 && actual != field.getValue().doubleValue()) {
                System.out.printf("PARITY step=%d %s Java=%.17g TS=%.17g delta=%.4g%n", step, key, actual, field.getValue().doubleValue(), actual-field.getValue().doubleValue());
            }
            double tolerance = switch (key) {
                case "x", "y" -> references.path("tolerance").path("positionMeters").doubleValue();
                case "velocityX", "velocityY" -> references.path("tolerance").path("velocityMetersPerSecond").doubleValue();
                case "angle", "yawRate", "steeringAngle" -> references.path("tolerance").path("angleRadians").doubleValue();
                case "frontWheelAngularSpeed", "rearWheelAngularSpeed" -> references.path("tolerance").path("wheelRadiansPerSecond").doubleValue();
                case "engineRpm" -> references.path("tolerance").path("engineRpm").doubleValue();
                case "gearShiftTimeRemaining" -> contract.stepSeconds() + Math.ulp(1.0);
                // Extra diagnostic acceleration must also stay well below the velocity tolerance per tick.
                case "longitudinalAcceleration" -> references.path("tolerance").path("velocityMetersPerSecond").doubleValue();
                default -> Math.ulp(1.0);
            };
            if (key.equals("angle")) actual = field.getValue().doubleValue() + VehicleIntegrator.normalizeAngle(actual - field.getValue().doubleValue());
            assertThat(actual).as("step %s field %s", step, key).isCloseTo(field.getValue().doubleValue(), within(tolerance));
        }
    }
    @Test void integratorExecutesStagesInCanonicalOrder() {
        List<Integer> trace = new ArrayList<>();
        integrator.integrate(new VehicleState("order", contract), new DriverInput(1, 0, 1), "asphalt", trace::add);
        assertThat(trace).containsExactly(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);
    }
    @Test void normalizesInputsAndRejectsInvalidSurfaces() {
        assertThat(new DriverInput(Double.NaN, 5, -3)).isEqualTo(new DriverInput(0, 1, -1));
        assertThatThrownBy(() -> integrator.integrate(new VehicleState("x", contract), DriverInput.NEUTRAL, "unknown"))
                .isInstanceOf(IllegalArgumentException.class);
    }
    @Test void damageDependsOnImpactDeltaVNotAbsoluteSpeed() {
        VehicleState slow = new VehicleState("same-id", contract), fast = new VehicleState("same-id", contract);
        fast.velocityX = 100;
        for (double deltaV : new double[] {4.86, 6, 12, 20}) {
            integrator.recordNormalImpact(slow, deltaV); integrator.recordNormalImpact(fast, deltaV);
            assertThat(fast.damageState).usingRecursiveComparison().isEqualTo(slow.damageState);
        }
        assertThat(slow.damageState.impactCount).isEqualTo(3);
    }
}
