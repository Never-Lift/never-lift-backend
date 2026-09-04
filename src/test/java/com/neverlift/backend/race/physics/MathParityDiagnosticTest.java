package com.neverlift.backend.race.physics;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import java.nio.file.Path;
import java.util.TreeMap;

/** Explicit diagnostic, not a replacement or relaxation of trajectory acceptance. */
@EnabledIfSystemProperty(named="physics.parity.diagnostics", matches="true")
class MathParityDiagnosticTest {
    @Test void reportsPrimitiveRounding() throws Exception {
        var probes=new ObjectMapper().readTree(Path.of("target/math-probes.json").toFile());
        var count=new TreeMap<String,Integer>(); var first=new TreeMap<String,String>();
        for (var probe:probes) {
            double a=probe.path("a").doubleValue(),b=probe.path("b").doubleValue(),expected=probe.path("value").doubleValue();
            String name=probe.path("name").asText();
            double actual=switch(name) {
                case "sin" -> StrictMath.sin(a); case "cos" -> StrictMath.cos(a); case "tanh" -> StrictMath.tanh(a);
                case "pow" -> Math.pow(a,b); case "atan2" -> StrictMath.atan2(a,b); default -> throw new IllegalArgumentException(name);
            };
            if (actual!=expected) {
                count.merge(name,1,Integer::sum);
                first.putIfAbsent(name, "a="+a+" b="+b+" Java="+actual+" TS="+expected);
            }
        }
        System.out.println("MATH ROUNDING COUNTS: "+count);
        System.out.println("FIRST DIFFERENCES: "+first);
    }
}
