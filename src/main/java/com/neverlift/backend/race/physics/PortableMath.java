package com.neverlift.backend.race.physics;

/** portable-f64-v1 (2.0.3): same IEEE-754 operations/order as portable-math.ts. No shared mutable scratch state. */
public final class PortableMath {
    private PortableMath() {}
    private static final double HALF_PI = 1.5707963267948966, HALF_PI_LOW = 6.123233995736766e-17;
    private static final double QUARTER_PI = 0.7853981633974483, QUARTER_PI_LOW = 3.061616997868383e-17;
    private static final double LN2_HIGH = 0.6931471803691238, LN2_LOW = 1.9082149292705877e-10, INVERSE_LN2 = 1.4426950408889634;

    private static double sineSeries(double x) {
        double square = -x * x, term = x, sum = x;
        for (int k = 1; k <= 10; k++) { term = term * square / ((2 * k) * (2 * k + 1)); sum += term; }
        return sum;
    }
    private static double cosineSeries(double x) {
        double square = -x * x, term = 1, sum = 1;
        for (int k = 1; k <= 10; k++) { term = term * square / ((2 * k - 1) * (2 * k)); sum += term; }
        return sum;
    }
    public static double sin(double angle) {
        if (angle == 0) return angle;
        if (!Double.isFinite(angle)) return Double.NaN;
        double q = Math.signum(angle) * Math.floor(Math.abs(angle) / HALF_PI + 0.5);
        int quadrant = (int) (((q % 4) + 4) % 4);
        double x = (angle - q * HALF_PI) - q * HALF_PI_LOW;
        return switch (quadrant) { case 0 -> sineSeries(x); case 1 -> cosineSeries(x); case 2 -> -sineSeries(x); default -> -cosineSeries(x); };
    }
    public static double cos(double angle) {
        if (!Double.isFinite(angle)) return Double.NaN;
        double q = Math.signum(angle) * Math.floor(Math.abs(angle) / HALF_PI + 0.5);
        int quadrant = (int) (((q % 4) + 4) % 4);
        double x = (angle - q * HALF_PI) - q * HALF_PI_LOW;
        return switch (quadrant) { case 0 -> cosineSeries(x); case 1 -> -sineSeries(x); case 2 -> -cosineSeries(x); default -> sineSeries(x); };
    }
    private static double atanPositive(double value) {
        boolean reciprocal = value > 1;
        double x = reciprocal ? 1 / value : value;
        boolean aroundOne = x > 0.41421356237309503;
        if (aroundOne) x = (x - 1) / (x + 1);
        double square = -x * x, term = x, sum = x;
        for (int k = 1; k <= 24; k++) { term *= square; sum += term / (2 * k + 1); }
        if (aroundOne) sum = QUARTER_PI + (sum + QUARTER_PI_LOW);
        return reciprocal ? HALF_PI - (sum - HALF_PI_LOW) : sum;
    }
    public static double atan2(double y, double x) {
        if (Double.isNaN(x) || Double.isNaN(y)) return Double.NaN;
        boolean negativeX = Double.doubleToRawLongBits(x) < 0, negativeY = Double.doubleToRawLongBits(y) < 0;
        double angle;
        if (y == 0) angle = negativeX ? Math.PI : 0;
        else if (x == 0) angle = HALF_PI;
        else if (!Double.isFinite(x) && !Double.isFinite(y)) angle = negativeX ? 3 * QUARTER_PI : QUARTER_PI;
        else { angle = atanPositive(Math.abs(y / x)); if (negativeX) angle = Math.PI - angle; }
        return negativeY ? -angle : angle;
    }
    private static double powerOfTwo(int exponent) { return Double.longBitsToDouble((long) (exponent + 1023) << 52); }
    private static double exponentialMinusOne(double x) {
        if (x == 0) return x;
        int exponent = (int) Math.floor(x * INVERSE_LN2 + 0.5);
        double remainder = (x - exponent * LN2_HIGH) - exponent * LN2_LOW, term = remainder, sum = remainder;
        for (int k = 2; k <= 18; k++) { term = term * remainder / k; sum += term; }
        if (exponent == 0) return sum;
        double factor = powerOfTwo(exponent);
        return (factor - 1) + factor * sum;
    }
    public static double tanh(double value) {
        if (Double.isNaN(value) || value == 0) return value;
        double x = Math.abs(value);
        if (x >= 22) return Math.signum(value);
        double t = exponentialMinusOne(x >= 1 ? 2 * x : -2 * x);
        double result = x >= 1 ? 1 - 2 / (t + 2) : -t / (t + 2);
        return value < 0 ? -result : result;
    }
    private static double logarithm(double x) {
        int correction = 0;
        if (x < 2.2250738585072014e-308) { x *= 18014398509481984.0; correction = -54; }
        long bits = Double.doubleToRawLongBits(x);
        int exponent = (int) (bits >>> 52) - 1023 + correction;
        double mantissa = Double.longBitsToDouble((bits & 0x000fffffffffffffL) | 0x3ff0000000000000L);
        if (mantissa > 1.4142135623730951) { mantissa /= 2; exponent++; }
        double z = (mantissa - 1) / (mantissa + 1), square = z * z, term = z, sum = z;
        for (int k = 1; k <= 16; k++) { term *= square; sum += term / (2 * k + 1); }
        return exponent * LN2_HIGH + (2 * sum + exponent * LN2_LOW);
    }
    public static double pow(double base, double exponent) {
        if (exponent == 0) return 1;
        if (Double.isNaN(base) || Double.isNaN(exponent) || base < 0) return Double.NaN;
        if (base == 0) return exponent > 0 ? 0 : Double.POSITIVE_INFINITY;
        if (base == 1) return 1;
        if (base == Double.POSITIVE_INFINITY) return exponent > 0 ? base : 0;
        if (Double.isFinite(exponent) && Math.abs(exponent) <= 9007199254740991.0 && Math.floor(exponent) == exponent) {
            double count = Math.abs(exponent), factor = exponent < 0 ? 1 / base : base, result = 1;
            while (count > 0) {
                if (count % 2 == 1) result *= factor;
                count = Math.floor(count / 2);
                if (count > 0) factor *= factor;
            }
            return result;
        }
        double x = exponent * logarithm(base);
        if (x > 709.782712893384) return Double.POSITIVE_INFINITY;
        if (x < -745.1332191019411) return 0;
        int scale = (int) Math.floor(x * INVERSE_LN2 + 0.5);
        double remainder = (x - scale * LN2_HIGH) - scale * LN2_LOW, term = remainder, sum = remainder;
        for (int k = 2; k <= 18; k++) { term = term * remainder / k; sum += term; }
        if (scale > 1023) return ((1 + sum) * powerOfTwo(1023)) * powerOfTwo(scale - 1023);
        if (scale < -1022) return ((1 + sum) * powerOfTwo(-1022)) * powerOfTwo(scale + 1022);
        return (1 + sum) * powerOfTwo(scale);
    }
    public static double hypot(double x, double y) {
        if (Double.isInfinite(x) || Double.isInfinite(y)) return Double.POSITIVE_INFINITY;
        double scale = Math.max(Math.abs(x), Math.abs(y));
        if (scale == 0) return 0;
        double a = x / scale, b = y / scale;
        return scale * Math.sqrt(a * a + b * b);
    }
}
