package com.neverlift.backend.race.physics;

/** Owned exclusively by one simulation loop. Snapshots must copy it, never expose it. */
public final class VehicleState {
    public final String id;
    public double x, y, velocityX, velocityY, angle, yawRate, steeringAngle;
    public double appliedThrottle, appliedBrake, frontWheelAngularSpeed, rearWheelAngularSpeed;
    public int gear = 1;
    public double engineRpm, gearShiftTimeRemaining;
    // Required by step 6: previous substep longitudinal acceleration, not derived u/v.
    public double longitudinalAcceleration;
    public double previousX, previousY, previousAngle;
    public String surface = "asphalt";
    public final DamageState damageState;

    public VehicleState(String id, PhysicsContract contract) {
        this.id = java.util.Objects.requireNonNull(id);
        engineRpm = contract.number("powertrain", "idleRpm");
        damageState = new DamageState(contract.number("damage", "maximumHealth"));
    }

    public static final class DamageState {
        public String kind = "none";
        public double health;
        public boolean engineDamaged, steeringDamaged;
        public int steeringPull, impactCount;
        public double lastImpactSpeed;
        DamageState(double health) { this.health = health; }
    }
}
