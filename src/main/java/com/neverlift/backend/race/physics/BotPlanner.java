package com.neverlift.backend.race.physics;

import com.fasterxml.jackson.databind.JsonNode;
import static java.lang.Math.*;
import static com.neverlift.backend.race.physics.PhysicsContract.requiredNumber;

/** Decision-only controller: no access to forces, damage multipliers or the integrator. */
public final class BotPlanner {
    private final JsonNode planner, difficulties;
    private final double terminalSpeed;
    public BotPlanner(PhysicsContract c) {
        difficulties=c.section("bots");planner=difficulties.path("planner");
        terminalSpeed=StrictMath.cbrt(2*c.number("powertrain","maxPowerWatts")*c.number("powertrain","drivetrainEfficiency")/(c.number("environment","airDensityKgPerCubicMeter")*c.number("vehicle","dragAreaM2")));
    }
    private double p(String key) { return requiredNumber(planner,key); }
    public DriverInput plan(VehicleState car,TrackGeometry geometry,double distance,double time,String difficulty) {
        JsonNode d=difficulties.path(difficulty);if(!d.isObject() || difficulty.equals("planner"))throw new IllegalArgumentException("Unknown bot difficulty");
        double speed=VehicleIntegrator.scaledHypot(car.velocityX,car.velocityY);
        var projection=geometry.project(new Vec2(car.x,car.y),distance);
        double ahead=p("steeringLookAheadBaseMeters")+speed*p("steeringLookAheadSpeedSeconds")+max(0,p("steeringLookAheadReactionReferenceSeconds")-requiredNumber(d,"steeringLookAheadPenaltySeconds"))*p("steeringLookAheadReactionGainMetersPerSecond");
        var target=geometry.racingPoint(projection.distance()+ahead);
        double heading=VehicleCollisions.angleDelta(car.angle,StrictMath.atan2(target.position().y()-car.y,target.position().x()-car.x));
        int seed=car.id.chars().sum();double noise=StrictMath.sin(time*p("steeringNoiseFrequencyRadiansPerSecond")+seed)*requiredNumber(d,"steeringNoise");
        double horizon=p("brakingLookAheadBaseMeters")+speed*(p("brakingLookAheadSpeedSeconds")+requiredNumber(d,"recoveryMultiplier")*p("brakingLookAheadRecoveryGainSeconds"));
        double factor=target.speedFactor();int count=(int)p("brakingPreviewSampleCount");
        for(int sample=1;sample<=count;sample++)factor=min(factor,geometry.racingPoint(projection.distance()+horizon*sample/count).speedFactor());
        double targetSpeed=terminalSpeed*pow(factor,p("racingLineSpeedFactorExponent"))*requiredNumber(d,"paceMultiplier")*p("terminalSpeedTargetMultiplier");
        double safe=targetSpeed/requiredNumber(d,"brakingSafetyMultiplier");
        boolean recovery=car.surface.equals("grass")||car.surface.equals("gravel"),braking=speed>safe||abs(heading)>p("brakeHeadingErrorThresholdRadians");
        double maxBrake=p("maximumBrakeBase")+requiredNumber(d,"recoveryMultiplier")*p("maximumBrakeRecoveryGain");
        return new DriverInput(braking?(recovery?p("brakingRecoveryThrottle"):p("brakingTrackThrottle")):requiredNumber(d,"paceMultiplier")*(recovery?p("recoveryThrottleMultiplier"):p("trackThrottleMultiplier")),
                braking?VehicleIntegrator.clamp(p("brakeDemandBase")+max(0,speed-safe)/p("brakeDemandSpeedScaleMetersPerSecond"),0,maxBrake):0,
                VehicleIntegrator.clamp(heading/p("steeringFullScaleHeadingErrorRadians")+noise,-1,1));
    }
}
