package com.neverlift.backend.race.physics;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiConsumer;

/** One authoritative owner per room. No HTTP, socket, wall-clock or race-rule work in a substep. */
public final class RaceEngine {
    /** Race rules run on the physics owner, around (never inside) the canonical integrator. */
    public interface StepRules {
        default void beforeStep() {}
        default boolean moves(String id) { return true; }
        default DriverInput input(VehicleState car, DriverInput requested) { return requested; }
        default boolean pairAllowed(String first, String second) { return true; }
        default void afterStep(Map<String, VehicleState> cars) {}
    }
    private static final StepRules PHYSICS_ONLY = new StepRules() {};
    // Approved M3 networking policy (online decisions #24), not a physical tuning constant.
    public static final long INPUT_HOLD_NANOS = java.time.Duration.ofMillis(200).toNanos();
    public record Entrant(String id, boolean bot, String difficulty, TrackGeometry.Spawn spawn) {}
    private record Command(DriverInput input, long sequence, long receivedNanos) {}
    private record Impact(VehicleState car, double deltaV) {}
    public record PhysicsState(double yawRate, double steeringAngle, double appliedThrottle, double appliedBrake,
            double frontWheelAngularSpeed, double rearWheelAngularSpeed, int gear, double engineRpm,
            double gearShiftTimeRemaining, double longitudinalAcceleration) {}
    public record DamageState(String kind, double health, boolean engineDamaged, boolean steeringDamaged,
            int steeringPull, boolean totalLoss, int impactCount, double lastImpactSpeed) {}
    public record CarSnapshot(String playerId, double x, double y, double velocityX, double velocityY,
            double angle, double speed, PhysicsState physicsState, DamageState damageState,
            double trackDistanceMeters, int trackLayer, long lastProcessedClientSeq) {}
    public record Snapshot(long tick, long serverTime, String trackId, String trackCatalogVersion,
            String physicsContractVersion, List<CarSnapshot> cars) {
        public Snapshot { cars = List.copyOf(cars); }
    }
    private final PhysicsContract contract;
    private final TrackGeometry track;
    private final VehicleIntegrator integrator;
    private final VehicleCollisions collisions;
    private final BotPlanner bots;
    private final Map<String, VehicleState> cars = new TreeMap<>();
    private final Map<String, Entrant> entrants = new TreeMap<>();
    private final Map<String, Double> distances = new TreeMap<>();
    private final Map<String, Integer> layers = new TreeMap<>();
    private final Map<String, Long> processed = new TreeMap<>();
    private final Map<String, Command> commands = new ConcurrentHashMap<>();
    private volatile Set<String> retained;
    private final Set<String> substitutes = ConcurrentHashMap.newKeySet();
    private final BiConsumer<String, Integer> trace;
    private long tick;
    private long resolvedContacts;
    private double simulationTime;

    public RaceEngine(PhysicsContract contract, TrackGeometry track, List<Entrant> entrants) {
        this(contract, track, entrants, (id,stage)->{});
    }
    public RaceEngine(PhysicsContract contract, TrackGeometry track, List<Entrant> entries, BiConsumer<String,Integer> trace) {
        this.contract=contract;this.track=track;this.trace=trace;
        integrator=new VehicleIntegrator(contract);collisions=new VehicleCollisions(contract);bots=new BotPlanner(contract);
        for(Entrant e:entries) {
            if(entrants.putIfAbsent(e.id,e)!=null)throw new IllegalArgumentException("Duplicate car identifier");
            VehicleState car=new VehicleState(e.id,contract);car.x=e.spawn.position().x();car.y=e.spawn.position().y();car.angle=VehicleCollisions.positiveAngle(e.spawn.angle());
            car.previousX=car.x;car.previousY=car.y;car.previousAngle=car.angle;cars.put(car.id,car);
            var projection=track.project(new Vec2(car.x,car.y),null);distances.put(car.id,projection.distance());layers.put(car.id,projection.layer());processed.put(car.id,-1L);
        }
        retained=Set.copyOf(entrants.keySet());
    }
    /** Normalization occurs on receipt; the simulation never waits for a new packet. */
    public boolean acceptInput(String id,DriverInput input,long sequence,long receivedNanos) {
        Entrant e=entrants.get(id);
        if(e==null || e.bot || !retained.contains(id) || sequence<0)return false;
        Command normalized=new Command(new DriverInput(input.throttle(),input.brake(),input.steer()),sequence,receivedNanos);
        java.util.concurrent.atomic.AtomicBoolean accepted = new java.util.concurrent.atomic.AtomicBoolean();
        commands.compute(id,(ignored,old)->{
            if(old==null || sequence>old.sequence) { accepted.set(true); return normalized; }
            return old;
        });
        return accepted.get();
    }
    public void clearInput(String id) { commands.remove(id); }
    public void retainParticipants(Set<String> ids) { retained=Set.copyOf(ids); }
    public void substitute(String id, boolean enabled) {
        if(enabled) { substitutes.add(id); clearInput(id); } else substitutes.remove(id);
    }
    public void tick(long nowNanos) {
        tick(nowNanos, PHYSICS_ONLY);
    }
    public void tick(long nowNanos, StepRules rules) {
        cars.keySet().removeIf(id->!retained.contains(id));
        for(int substep=0;substep<(int)contract.number("simulation","serverPhysicsSubstepsPerTick");substep++) step(nowNanos, rules);
        tick++;
    }
    private void step(long nowNanos, StepRules rules) {
        rules.beforeStep();
        List<Impact> impacts=new ArrayList<>();
        for(VehicleState car:cars.values()) {
            Entrant e=entrants.get(car.id);Command command=commands.get(car.id);
            DriverInput input=e.bot || substitutes.contains(car.id)?bots.plan(car,track,distances.get(car.id),simulationTime,e.bot?e.difficulty:"normal"):command!=null && nowNanos-command.receivedNanos<=INPUT_HOLD_NANOS?command.input:DriverInput.NEUTRAL;
            if(!e.bot && command!=null)processed.put(car.id,command.sequence);
            input=rules.input(car,input);
            if(!rules.moves(car.id))continue;
            integrator.integrate(car,input,track.surface(new Vec2(car.x,car.y),distances.get(car.id)),stage->trace.accept(car.id,stage));
        }
        // Stage 14: walls, stable car pairs, then overlap-only wall cleanup after pair impulses.
        for(VehicleState car:cars.values()) {
            if(!rules.moves(car.id))continue;
            trace.accept(car.id,14);
            if(collisions.againstBarriers(car,contract.stepSeconds(),bounds->track.barriers(layers.get(car.id),bounds),(c,v)->impacts.add(new Impact(c,v))))resolvedContacts++;
            var p=track.project(new Vec2(car.x,car.y),distances.get(car.id));distances.put(car.id,p.distance());layers.put(car.id,p.layer());
        }
        List<VehicleState> ordered=List.copyOf(cars.values());
        for(int i=0;i<ordered.size();i++) for(int j=i+1;j<ordered.size();j++) {
            VehicleState a=ordered.get(i),b=ordered.get(j);
            if(rules.moves(a.id) && rules.moves(b.id) && rules.pairAllowed(a.id,b.id) && layers.get(a.id).equals(layers.get(b.id)) && collisions.pair(a,b,contract.stepSeconds(),(c,v)->impacts.add(new Impact(c,v))))resolvedContacts++;
        }
        for(VehicleState car:ordered)if(rules.moves(car.id))collisions.againstBarriers(car,0,bounds->track.barriers(layers.get(car.id),bounds),(c,v)->impacts.add(new Impact(c,v)));
        // Stage 15 preserves ordered contact damage; friction never contributes to its delta-v.
        for(VehicleState car:ordered) {
            trace.accept(car.id,15);
            for(Impact impact:impacts)if(impact.car==car)integrator.recordNormalImpact(car,impact.deltaV);
        }
        simulationTime+=contract.stepSeconds();
        rules.afterStep(Collections.unmodifiableMap(cars));
    }
    /** Called only by the simulation owner; records contain no mutable state. */
    public Snapshot snapshot(long epochMillis) {
        List<CarSnapshot> copies=new ArrayList<>();
        for(VehicleState c:cars.values()) {
            var d=c.damageState;
            copies.add(new CarSnapshot(c.id,c.x,c.y,c.velocityX,c.velocityY,c.angle,VehicleIntegrator.scaledHypot(c.velocityX,c.velocityY),
                    new PhysicsState(c.yawRate,c.steeringAngle,c.appliedThrottle,c.appliedBrake,c.frontWheelAngularSpeed,c.rearWheelAngularSpeed,c.gear,c.engineRpm,c.gearShiftTimeRemaining,c.longitudinalAcceleration),
                    new DamageState(d.kind,d.health,d.engineDamaged,d.steeringDamaged,d.steeringPull,d.kind.equals("total-loss"),d.impactCount,d.lastImpactSpeed),distances.get(c.id),layers.get(c.id),processed.get(c.id)));
        }
        return new Snapshot(tick,epochMillis,track.id,track.catalogVersion,contract.version(),copies);
    }
    /** Diagnostic counter, not damage and not an input to simulation. */
    public long resolvedContacts(){return resolvedContacts;}
}
