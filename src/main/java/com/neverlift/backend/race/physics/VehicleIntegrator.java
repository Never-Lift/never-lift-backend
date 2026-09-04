package com.neverlift.backend.race.physics;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.function.IntConsumer;
import static java.lang.StrictMath.*;
import static com.neverlift.backend.race.physics.PhysicsContract.requiredNumber;

/** Canonical steps 1–13. Collision and damage are explicit stages 14/15 in the room engine. */
public final class VehicleIntegrator {
    private final PhysicsContract contract;
    private final JsonNode v, p, tires, controls, surfaces, damage;
    private final double dt, epsilon, gravity, airDensity;
    public VehicleIntegrator(PhysicsContract contract) {
        this.contract = contract;
        v = contract.section("vehicle"); p = contract.section("powertrain");
        tires = contract.section("tires"); controls = contract.section("controls");
        surfaces = contract.section("surfaces"); damage = contract.section("damage");
        dt = contract.stepSeconds(); epsilon = contract.number("simulation", "numericSpeedEpsilonMetersPerSecond");
        gravity = contract.number("environment", "gravityMetersPerSecondSquared");
        airDensity = contract.number("environment", "airDensityKgPerCubicMeter");
    }
    private double v(String key) { return requiredNumber(v, key); }
    private double p(String key) { return requiredNumber(p, key); }
    private double d(String key) { return requiredNumber(damage, key); }
    private double t(String key) { return requiredNumber(tires, key); }
    private double c(String key) { return requiredNumber(controls, key); }
    // Match the two-argument scaled norm evaluated by the TypeScript runtime.
    static double scaledHypot(double x, double y) {
        double scale = max(abs(x), abs(y));
        if (scale == 0) return 0;
        double a = x / scale, b = y / scale;
        return scale * sqrt(a * a + b * b);
    }
    public static double clamp(double value, double low, double high) { return max(low, min(high, value)); }
    public static double moveTowards(double value, double target, double delta) {
        return abs(target - value) <= delta ? target : value + signum(target - value) * delta;
    }
    public static double normalizeAngle(double angle) {
        double result = signum(angle) * (abs(angle) % (PI * 2));
        return result > PI ? result - PI * 2 : result < -PI ? result + PI * 2 : result;
    }
    public void integrate(VehicleState s, DriverInput input, String surface) {
        integrate(s, input, surface, ignored -> {});
    }
    public void integrate(VehicleState s, DriverInput rawInput, String surface, IntConsumer stage) {
        JsonNode ground = surfaces.path(surface);
        if (!ground.isObject()) throw new IllegalArgumentException("Unknown surface: " + surface);
        s.previousX = s.x; s.previousY = s.y; s.previousAngle = s.angle;
        stage.accept(1);
        DriverInput input = new DriverInput(rawInput.throttle(), rawInput.brake(), rawInput.steer());
        stage.accept(2);
        boolean disabled = s.damageState.kind.equals("total-loss");
        double throttle = disabled ? 0 : input.throttle(), brake = disabled ? 0 : input.brake();
        double pull = s.damageState.steeringDamaged ? s.damageState.steeringPull * d("steeringPullStrength") : 0;
        double steer = disabled ? 0 : clamp(input.steer() + pull, -1, 1) * v("maxSteeringAngleRadians");
        s.appliedThrottle = moveTowards(s.appliedThrottle, throttle,
                c(throttle > s.appliedThrottle ? "throttleRisePerSecond" : "throttleFallPerSecond") * dt);
        s.appliedBrake = moveTowards(s.appliedBrake, brake,
                c(brake > s.appliedBrake ? "brakeRisePerSecond" : "brakeFallPerSecond") * dt);
        s.steeringAngle = moveTowards(s.steeringAngle, steer,
                c(abs(steer) < abs(s.steeringAngle) ? "steeringReturnRadiansPerSecond" : "steeringActuationRadiansPerSecond") * dt);
        stage.accept(3);
        double cosine = PortableMath.cos(s.angle), sine = PortableMath.sin(s.angle);
        // Transmission road RPM needs this projection before the tire step; u/v are never stored.
        double roadSpeed = s.velocityX * cosine + s.velocityY * sine;
        boolean reversing = s.appliedBrake > p("reverseInputThreshold") && s.appliedThrottle < p("reverseInputThreshold")
                && (s.gear == -1 || abs(roadSpeed) < p("reverseEngageSpeedMetersPerSecond"));
        double driveTorque = powertrain(s, roadSpeed, reversing);
        stage.accept(4);
        double u = s.velocityX * cosine + s.velocityY * sine;
        double lateral = s.velocityX * -sine + s.velocityY * cosine;
        double speed = scaledHypot(s.velocityX, s.velocityY);
        double slipReference = max(abs(u), t("minimumSlipSpeedMetersPerSecond"));
        stage.accept(5);
        double pressure = 0.5 * airDensity * speed * speed;
        double drag = pressure * v("dragAreaM2") * (disabled ? d("totalLossDragMultiplier") : 1);
        double downforce = pressure * v("liftAreaM2");
        stage.accept(6);
        double weight = v("massKg") * gravity;
        double staticFront = weight * v("rearAxleDistanceFromComMeters") / v("wheelbaseMeters");
        double staticRear = weight - staticFront;
        double transfer = v("massKg") * s.longitudinalAcceleration * v("centerOfMassHeightMeters") / v("wheelbaseMeters");
        double frontLoad = max(0, staticFront - transfer + downforce * v("aeroBalanceFront"));
        double rearLoad = max(0, staticRear + transfer + downforce * (1 - v("aeroBalanceFront")));
        stage.accept(7);
        double frontSlipAngle = PortableMath.atan2(lateral + v("frontAxleDistanceFromComMeters") * s.yawRate, slipReference) - s.steeringAngle;
        double rearSlipAngle = PortableMath.atan2(lateral - v("rearAxleDistanceFromComMeters") * s.yawRate, slipReference);
        double frontSlip = (s.frontWheelAngularSpeed * v("wheelRadiusMeters") - u) / slipReference;
        double rearSlip = (s.rearWheelAngularSpeed * v("wheelRadiusMeters") - u) / slipReference;
        stage.accept(8);
        double[] front = pureTire(frontLoad, staticFront, frontSlip, frontSlipAngle, t("frontCorneringStiffnessNPerRadian"), ground);
        double[] rear = pureTire(rearLoad, staticRear, rearSlip, rearSlipAngle, t("rearCorneringStiffnessNPerRadian"), ground);
        stage.accept(9);
        combine(front); combine(rear);
        double steerCos = PortableMath.cos(s.steeringAngle), steerSin = PortableMath.sin(s.steeringAngle);
        double frontFx = front[0] * steerCos - front[1] * steerSin;
        double frontFy = front[0] * steerSin + front[1] * steerCos;
        stage.accept(10);
        double rolling = v("rollingResistanceCoefficient") * v("massKg") * gravity * requiredNumber(ground, "rollingResistanceMultiplier");
        double rough = requiredNumber(ground, "roughnessDragNewtonSecondsPerMeter") * abs(u);
        double longitudinalResistance = abs(u) > epsilon ? signum(u) * (rolling + rough) : 0;
        double aeroLong = speed > epsilon ? drag * u / speed : 0;
        double aeroLat = speed > epsilon ? drag * lateral / speed : 0;
        double totalFx = frontFx + rear[0] - longitudinalResistance - aeroLong - (disabled ? d("totalLossLinearDragNewtonSecondsPerMeter") * u : 0);
        double totalFy = frontFy + rear[1] - aeroLat - (disabled ? d("totalLossLinearDragNewtonSecondsPerMeter") * lateral : 0);
        stage.accept(11);
        double yawMoment = v("frontAxleDistanceFromComMeters") * frontFy - v("rearAxleDistanceFromComMeters") * rear[1];
        stage.accept(12);
        s.longitudinalAcceleration = totalFx / v("massKg");
        double lateralAcceleration = totalFy / v("massKg");
        s.velocityX += (cosine * s.longitudinalAcceleration + -sine * lateralAcceleration) * dt;
        s.velocityY += (sine * s.longitudinalAcceleration + cosine * lateralAcceleration) * dt;
        s.yawRate += yawMoment / v("yawInertiaKgM2") * dt;
        s.angle = normalizeAngle(s.angle + s.yawRate * dt);
        s.x += s.velocityX * dt; s.y += s.velocityY * dt; s.surface = surface;
        stage.accept(13);
        double brakeDemand = reversing ? 0 : s.appliedBrake * p("maximumBrakeForceNewtons");
        double frontBrake = brakeDemand * p("frontBrakeBias") * v("wheelRadiusMeters");
        double rearBrake = brakeDemand * (1 - p("frontBrakeBias")) * v("wheelRadiusMeters");
        double previousFront = s.frontWheelAngularSpeed, previousRear = s.rearWheelAngularSpeed;
        s.frontWheelAngularSpeed += (-front[0] * v("wheelRadiusMeters") - brakeSign(previousFront, u) * frontBrake) / p("frontAxleRotationalInertiaKgM2") * dt;
        s.rearWheelAngularSpeed += (driveTorque - rear[0] * v("wheelRadiusMeters") - brakeSign(previousRear, u) * rearBrake) / p("rearAxleRotationalInertiaKgM2") * dt;
        if (frontBrake > 0 && previousFront * s.frontWheelAngularSpeed < 0) s.frontWheelAngularSpeed = 0;
        if (rearBrake > 0 && driveTorque == 0 && previousRear * s.rearWheelAngularSpeed < 0) s.rearWheelAngularSpeed = 0;
    }
    private double brakeSign(double omega, double u) {
        return abs(omega) > epsilon / v("wheelRadiusMeters") ? signum(omega) : abs(u) > epsilon ? signum(u) : 0;
    }
    private double[] pureTire(double load, double reference, double slip, double slipAngle, double stiffness, JsonNode ground) {
        double peak = t("referenceFrictionCoefficient") * requiredNumber(ground, "gripMultiplier") * reference
                * PortableMath.pow(max(0, load) / reference, t("loadSensitivityExponent"));
        if (peak <= ulp(1.0)) return new double[] {0, 0, 0};
        return new double[] {peak * PortableMath.tanh(t("longitudinalStiffnessNPerSlip") * slip / peak),
                -peak * PortableMath.tanh(stiffness * requiredNumber(ground, "corneringMultiplier") * slipAngle / peak), peak};
    }
    private void combine(double[] tire) {
        if (tire[2] <= ulp(1.0)) return;
        double demand = scaledHypot(tire[0] / tire[2], tire[1] / tire[2]);
        double scale = demand > 1 ? 1 / demand : 1;
        tire[0] *= scale; tire[1] *= scale;
    }
    private double rpm(double omega, double ratio) {
        return max(p("idleRpm"), abs(omega) * ratio * p("finalDriveRatio") * (60 / (PI * 2)));
    }
    private double ratio(int gear) { return p.path("gearRatios").get(gear - 1).doubleValue(); }
    private double powertrain(VehicleState s, double u, boolean reverse) {
        double rawRpm;
        if (reverse) {
            s.gear = -1; s.gearShiftTimeRemaining = 0;
            rawRpm = rpm(s.rearWheelAngularSpeed, p("reverseGearRatio"));
            s.engineRpm = clamp(rawRpm, p("idleRpm"), p("redlineRpm"));
        } else {
            s.gear = (int) clamp(s.gear == 0 ? 1 : s.gear, 1, p.path("gearRatios").size());
            rawRpm = rpm(s.rearWheelAngularSpeed, ratio(s.gear));
            s.engineRpm = clamp(rawRpm, p("idleRpm"), p("redlineRpm"));
            s.gearShiftTimeRemaining = max(0, s.gearShiftTimeRemaining - dt);
            if (s.gearShiftTimeRemaining <= 0) {
                int next = s.gear;
                double roadRpm = rpm(u / v("wheelRadiusMeters"), ratio(s.gear));
                if (rawRpm >= p("upshiftRpm") && roadRpm >= p("upshiftRpm") / (1 + p("automaticUpshiftWheelSlipAllowance"))
                        && s.gear < p.path("gearRatios").size()) next++;
                else if (roadRpm <= p("downshiftRpm") && s.gear > 1) next--;
                if (next != s.gear) {
                    s.gear = next; s.gearShiftTimeRemaining = p("shiftDurationSeconds");
                    s.engineRpm = clamp(rpm(s.rearWheelAngularSpeed, ratio(s.gear)), p("idleRpm"), p("redlineRpm"));
                }
            }
        }
        if (rawRpm >= p("redlineRpm") || (!reverse && (s.gearShiftTimeRemaining > 0 || s.appliedThrottle <= 0))) return 0;
        double torque = p("maxTorqueNm") * (s.damageState.engineDamaged ? d("engineTorqueMultiplier") : 1);
        double power = p("maxPowerWatts") * (s.damageState.engineDamaged ? d("enginePowerMultiplier") : 1);
        return (reverse ? -1 : 1) * min(torque, power / (s.engineRpm / (60 / (PI * 2))))
                * (reverse ? p("reverseGearRatio") : ratio(s.gear)) * p("finalDriveRatio") * p("drivetrainEfficiency")
                * (reverse ? s.appliedBrake : s.appliedThrottle);
    }
    public void recordNormalImpact(VehicleState s, double deltaV) {
        var damage = s.damageState;
        if (!Double.isFinite(deltaV) || deltaV < d("minimumDeltaVMetersPerSecond") || damage.kind.equals("total-loss")) return;
        damage.impactCount++; damage.lastImpactSpeed = deltaV;
        damage.health = clamp(damage.health - deltaV * d("healthDamagePerDeltaV"), 0, d("maximumHealth"));
        if (deltaV >= d("totalLossDeltaVMetersPerSecond") || damage.health <= 0) {
            damage.health = 0; damage.engineDamaged = true; damage.steeringDamaged = true;
        } else if (deltaV >= d("combinedDeltaVMetersPerSecond")) {
            damage.engineDamaged = true; damage.steeringDamaged = true; damage.steeringPull = steeringPull(s, deltaV);
        } else if (deltaV >= d("mediumDeltaVMetersPerSecond")) damage.engineDamaged = true;
        else { damage.steeringDamaged = true; damage.steeringPull = steeringPull(s, deltaV); }
        damage.kind = damage.health <= 0 ? "total-loss" : damage.engineDamaged && damage.steeringDamaged ? "engine-and-steering"
                : damage.engineDamaged ? "engine" : damage.steeringDamaged ? "steering" : "none";
    }
    private int steeringPull(VehicleState s, double deltaV) {
        int hash = 17;
        for (int i = 0; i < s.id.length(); i++) hash = hash * 31 + s.id.charAt(i);
        return (hash + (long) s.damageState.impactCount + (long) floor(deltaV * 10 + 0.5)) % 2 == 0 ? -1 : 1;
    }
}
