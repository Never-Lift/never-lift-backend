package com.neverlift.backend.race.physics;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;

/** Immutable, fail-closed access to the published numeric contract. No fallback tuning. */
public final class PhysicsContract {
    private final JsonNode constants;

    public PhysicsContract() {
        constants = resource("physics-constants.json");
        if (!"2.0.2".equals(version())) throw new IllegalStateException("Unsupported physics contract");
        if (number("simulation", "serverPhysicsSubstepsPerTick") * stepSeconds()
                != number("simulation", "serverTickSeconds")) {
            throw new IllegalStateException("Inconsistent server substep clock");
        }
    }

    public static JsonNode resource(String file) {
        String path = "/contracts/module-2/v2/" + file;
        try (InputStream stream = PhysicsContract.class.getResourceAsStream(path)) {
            if (stream == null) throw new IllegalStateException("Missing physics resource: " + path);
            return new ObjectMapper().readTree(stream);
        } catch (IOException exception) {
            throw new IllegalStateException("Invalid physics resource: " + path, exception);
        }
    }

    public String version() { return constants.path("version").asText(); }
    public double stepSeconds() { return number("simulation", "physicsStepSeconds"); }
    public JsonNode section(String section) {
        JsonNode value = constants.path(section);
        if (!value.isObject()) throw new IllegalArgumentException("Missing contract section: " + section);
        return value.deepCopy();
    }
    public double number(String section, String name) { return requiredNumber(constants.path(section), name); }
    public static double requiredNumber(JsonNode section, String name) {
        JsonNode value = section.path(name);
        if (!value.isNumber() || !Double.isFinite(value.doubleValue())) {
            throw new IllegalArgumentException("Missing/invalid numeric constant: " + name);
        }
        return value.doubleValue();
    }
}
