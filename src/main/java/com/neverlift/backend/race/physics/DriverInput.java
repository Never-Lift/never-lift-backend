package com.neverlift.backend.race.physics;

public record DriverInput(double throttle, double brake, double steer) {
    public static final DriverInput NEUTRAL = new DriverInput(0, 0, 0);
    public DriverInput {
        throttle = normalized(throttle, 0, 1);
        brake = normalized(brake, 0, 1);
        steer = normalized(steer, -1, 1);
    }
    private static double normalized(double value, double min, double max) {
        return Double.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
    }
}
