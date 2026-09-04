package com.neverlift.backend.race.physics;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PortableMathTest {
    @Test void retainsAccuracyAcrossThePhysicalDomain() {
        for (int i = -2048; i <= 2048; i++) {
            double x = i / 32.0;
            assertThat(PortableMath.sin(x)).isCloseTo(StrictMath.sin(x), within(1e-13));
            assertThat(PortableMath.cos(x)).isCloseTo(StrictMath.cos(x), within(1e-13));
            assertThat(PortableMath.tanh(x)).isCloseTo(StrictMath.tanh(x), within(2e-15));
            assertThat(PortableMath.sin(-x)).isEqualTo(-PortableMath.sin(x));
            assertThat(PortableMath.cos(-x)).isEqualTo(PortableMath.cos(x));
        }
    }
    @Test void respectsQuadrantsZerosAndSpecialValues() {
        double[] values = {Double.NEGATIVE_INFINITY, -100, -1, -1e-20, -0.0, 0, 1e-20, 1, 100, Double.POSITIVE_INFINITY};
        for (double x : values) for (double y : values) assertThat(PortableMath.atan2(y, x)).isCloseTo(StrictMath.atan2(y, x), within(1e-15));
        assertThat(Double.doubleToRawLongBits(PortableMath.atan2(-0.0, 1))).isEqualTo(Double.doubleToRawLongBits(-0.0));
        assertThat(PortableMath.sin(Double.POSITIVE_INFINITY)).isNaN();
        assertThat(PortableMath.hypot(Double.POSITIVE_INFINITY, Double.NaN)).isInfinite();
    }
    @Test void powersRemainAccurateWithoutChangingLoadOrBotTuning() {
        for (int i = -120; i <= 120; i++) for (double exponent : new double[] {0, 0.9, 1.45, -0.5, 2}) {
            double base = StrictMath.pow(2, i / 8.0), expected = StrictMath.pow(base, exponent);
            assertThat(Math.abs(PortableMath.pow(base, exponent) - expected) / expected).isLessThan(2e-14);
        }
        assertThat(PortableMath.pow(0, 0.9)).isZero();
        assertThat(PortableMath.pow(-1, 0.9)).isNaN();
    }
}
