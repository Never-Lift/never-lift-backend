package com.neverlift.backend.race.online;

import com.fasterxml.jackson.databind.JsonNode;
import com.neverlift.backend.race.physics.*;
import java.util.*;

/** Single-owner orchestration; tick/input/update calls are serialized by the room runtime. */
public final class OnlineRaceSession implements RaceEngine.StepRules {
    public enum Phase { QUALIFYING, QUALIFYING_RESULTS, COUNTDOWN, RACE, RESULTS, LOBBY }
    public record Participant(String id, UUID userId, String displayName, String color, boolean bot) {}
    public record Event(String type, Object payload) {}
    public record Standing(String playerId, UUID userId, String displayName, int position,
            long totalTimeMs, long bestLapTimeMs, boolean finished, int laps, double progressMeters) {}
    public record Result(UUID sessionId, String trackId, String trackCatalogVersion,
            String physicsContractVersion, List<Standing> standings) {}
    public record Car(String playerId, double x, double y, double velocityX, double velocityY,
            double angle, double speed, RaceEngine.PhysicsState physicsState, RaceEngine.DamageState damageState,
            double trackDistanceMeters, int trackLayer, long lastProcessedClientSeq,
            int lap, boolean isGhost, boolean falseStart, boolean inPit,
            int position, int nextCheckpoint, int qualifyingAttempts, long currentLapTimeMs, long bestLapTimeMs) {}
    public record Snapshot(UUID sessionId,long tick, long substep, long physicsSubstep, long serverTime, String trackId, String trackCatalogVersion,
            String physicsContractVersion, String phase, int totalLaps, long raceTimeMs, List<Car> cars) {}
    private static final int HZ=120;
    public static final int FALSE_START_STEPS=600;
    private final UUID raceId=UUID.randomUUID();
    private final PhysicsContract contract;
    private final TrackGeometry track;
    private final JsonNode definition;
    private final int lapLimit;
    public static final int QUALIFYING_LAPS=2;
    private final String difficulty;
    private final long epochMillis;
    private final Map<String,Participant> participants=new TreeMap<>();
    private final Map<String,Progress> progress=new TreeMap<>();
    private final Map<String,Long> sequences=new HashMap<>();
    private final Set<String> substitutes=new HashSet<>(), earlyThrottle=new HashSet<>();
    private final List<Event> events=new ArrayList<>();
    private List<String> grid;
    private RaceEngine engine;
    private Phase phase=Phase.QUALIFYING;
    private long steps, phaseSteps, raceSteps;
    private int lightStage;
    private boolean startedDriving;
    private Result result;
    private static final class Progress {
        TrackProgress gates;
        double lapStarted=-1, best=Double.POSITIVE_INFINITY, bestAt=Double.POSITIVE_INFINITY;
        double finishAt=Double.POSITIVE_INFINITY;
        long progressAt;
        int lockRemaining, blockedSteps, qualifyingAttempts;
        boolean jumped;
        Progress(TrackProgress gates){this.gates=gates;}
    }

    public OnlineRaceSession(PhysicsContract contract, JsonNode definition, List<Participant> entrants,
            int laps, String difficulty, long epochMillis) {
        if(laps<1 || laps>99)
            throw new IllegalArgumentException("Invalid session limits");
        this.contract=contract;this.definition=definition.deepCopy();track=new TrackGeometry(contract,definition);
        this.lapLimit=laps;this.difficulty=difficulty;this.epochMillis=epochMillis;
        for(var p:entrants)if(participants.putIfAbsent(p.id(),p)!=null)throw new IllegalArgumentException("Duplicate participant");
        if(participants.size()<2 || participants.size()>22)throw new IllegalArgumentException("Invalid grid");
        grid=List.copyOf(participants.keySet());resetEngine(true);
        event("qualifying_start",Map.of("laps",QUALIFYING_LAPS,"countdownSeconds",3));
    }
    private void resetEngine(boolean qualifying) {
        List<RaceEngine.Entrant> entries=new ArrayList<>();
        for(int i=0;i<grid.size();i++) {
            String id=grid.get(i);Participant p=participants.get(id);
            entries.add(new RaceEngine.Entrant(id,p.bot(),difficulty,track.spawn(qualifying?0:i)));
            Progress old=progress.get(id), next=new Progress(new TrackProgress(track,definition,contract));
            if(!qualifying && old!=null){next.best=old.best;next.bestAt=old.bestAt;}
            progress.put(id,next);
        }
        engine=new RaceEngine(contract,track,entries);
        substitutes.forEach(id->engine.substitute(id,true));
    }
    public boolean input(String id, DriverInput input, long sequence, long receivedNanos) {
        Participant p=participants.get(id);
        if(p==null || p.bot() || substitutes.contains(id) || sequence<0 || sequence<=sequences.getOrDefault(id,-1L))return false;
        if(!engine.acceptInput(id,input,sequence,receivedNanos))return false;
        sequences.put(id,sequence);
        if(phase==Phase.COUNTDOWN && input.throttle()>0)earlyThrottle.add(id);
        return true;
    }
    public void connected(String id, boolean connected) {
        if(!participants.containsKey(id) || participants.get(id).bot())return;
        if(connected)substitutes.remove(id);else substitutes.add(id);
        engine.substitute(id,!connected);
    }
    public boolean substituted(String id){return substitutes.contains(id);}
    public void leave(String id) {
        connected(id,false);
        if(phase==Phase.QUALIFYING)progress.get(id).qualifyingAttempts=QUALIFYING_LAPS;
    }
    public void tick(long nowNanos) { engine.tick(nowNanos,this); }
    public void startRace() {
        if(phase!=Phase.QUALIFYING_RESULTS)throw new IllegalStateException("Qualification has not ended");
        resetEngine(false);
        // Race best lap is independent of qualifying best lap.
        progress.values().forEach(p->{p.best=Double.POSITIVE_INFINITY;p.bestAt=Double.POSITIVE_INFINITY;});
        setPhase(Phase.COUNTDOWN);
        events.add(new Event("countdown",Map.of("sessionId",raceId,"startAtServerTime",serverTime()+lightsSteps()*1000/HZ)));
    }
    public void acknowledgeResults() { if(phase==Phase.RESULTS)setPhase(Phase.LOBBY); }
    public Phase phase(){return phase;}
    public boolean startedDriving(){return startedDriving;}
    public Result result(){return result;}
    public long resolvedContacts(){return engine.resolvedContacts();}
    public int blockedSteps(String id){return progress.get(id).blockedSteps;}
    private long lightsSteps() {
        return Math.round(((contract.number("race","startLightCount")-1)*contract.number("race","startLightStageSeconds")
                +contract.number("race","lightsOutDelaySeconds"))*HZ);
    }
    @Override public void beforeStep() {
        if(phase==Phase.COUNTDOWN) {
            for(String id:earlyThrottle) {
                Progress p=progress.get(id);
                if(!p.jumped){p.jumped=true;p.lockRemaining=FALSE_START_STEPS;event("false_start",Map.of("playerId",id,"blockedSubsteps",FALSE_START_STEPS,"penaltySeconds",5));}
            }
            earlyThrottle.clear();
            if(phaseSteps>=lightsSteps()) {
                setPhase(Phase.RACE);raceSteps=0;
                event("lights_out",Map.of("stage",0));
            } else {
                int stage=Math.min((int)contract.number("race","startLightCount"),1+(int)(phaseSteps/Math.round(contract.number("race","startLightStageSeconds")*HZ)));
                if(stage!=lightStage){lightStage=stage;event("start_light",Map.of("stage",stage));}
            }
        }
    }
    @Override public boolean moves(String id) {
        return phase==Phase.RACE || phase==Phase.QUALIFYING && phaseSteps>=3L*HZ
                && progress.get(id).qualifyingAttempts<QUALIFYING_LAPS;
    }
    @Override public DriverInput input(VehicleState car, DriverInput input) {
        Progress p=progress.get(car.id);
        if(phase==Phase.RACE && p.lockRemaining>0) {
            car.appliedThrottle=0;
            p.blockedSteps++;
            return new DriverInput(0,input.brake(),input.steer());
        }
        return input;
    }
    @Override public boolean pairAllowed(String a, String b) {
        return phase==Phase.RACE && Double.isFinite(progress.get(a).finishAt)==Double.isFinite(progress.get(b).finishAt);
    }
    @Override public void afterStep(Map<String,VehicleState> cars) {
        List<String> finished=new ArrayList<>();
        for(VehicleState car:cars.values()) {
            Progress p=progress.get(car.id);
            if(!moves(car.id))continue;
            if(phase==Phase.QUALIFYING && (car.x!=car.previousX || car.y!=car.previousY))startedDriving=true;
            if(phase==Phase.RACE && p.lockRemaining>0)p.lockRemaining--;
            if(Double.isFinite(p.finishAt))continue;
            double oldProgress=p.gates.validProgress();
            var crossing=p.gates.advance(new Vec2(car.previousX,car.previousY),new Vec2(car.x,car.y));
            if(p.gates.validProgress()>oldProgress)p.progressAt=steps;
            if(crossing.checkpoint())event("checkpoint",Map.of("playerId",car.id,"checkpointIndex",p.gates.nextCheckpoint()-1,"lap",p.gates.laps()));
            if(crossing.finish()) {
                double at=(phase==Phase.RACE?raceSteps:phaseSteps)+crossing.fraction();
                if(phase==Phase.QUALIFYING && p.lapStarted>=0)p.qualifyingAttempts++;
                if(crossing.validLap() && p.lapStarted>=0) {
                    double elapsed=at-p.lapStarted;
                    if(elapsed<p.best){p.best=elapsed;p.bestAt=steps+crossing.fraction();}
                    event("lap_complete",Map.of("playerId",car.id,"lap",p.gates.laps(),"lapTimeMs",millis(elapsed)));
                    if(phase==Phase.RACE && p.gates.laps()>=lapLimit){p.finishAt=at;finished.add(car.id);}
                }
                p.lapStarted=at;
            }
            if(phase==Phase.QUALIFYING && car.damageState.kind.equals("total-loss"))p.qualifyingAttempts=QUALIFYING_LAPS;
        }
        finished.sort(Comparator.comparingDouble((String id)->progress.get(id).finishAt).thenComparing(id->id));
        for(String id:finished) {
            int position=orderedStandings().indexOf(id)+1;
            event("finished",Map.of("playerId",id,"position",position,"totalTimeMs",millis(progress.get(id).finishAt)));
        }
        steps++;phaseSteps++;
        if(phase==Phase.RACE) {
            raceSteps++;
            long timeout=(long)Math.ceil(Math.max(contract.number("race","minimumRaceDurationSeconds"),
                    track.length/contract.number("race","raceDurationReferenceSpeedMetersPerSecond")*lapLimit)*HZ);
            if(progress.values().stream().allMatch(p->Double.isFinite(p.finishAt)) || raceSteps>=timeout)finishRace();
        } else if(phase==Phase.QUALIFYING && progress.values().stream().allMatch(p->p.qualifyingAttempts>=QUALIFYING_LAPS))finishQualifying();
        else if(phase==Phase.RESULTS && phaseSteps>=60L*HZ)setPhase(Phase.LOBBY);
    }
    private void finishQualifying() {
        grid=participants.keySet().stream().sorted(Comparator
                .comparingDouble((String id)->progress.get(id).best)
                .thenComparingDouble(id->progress.get(id).bestAt)
                .thenComparingInt(id->Objects.hash(raceId,id)).thenComparing(id->id)).toList();
        setPhase(Phase.QUALIFYING_RESULTS);
        List<Map<String,Object>> times=new ArrayList<>();
        for(int i=0;i<grid.size();i++){String id=grid.get(i);times.add(Map.of("playerId",id,"position",i+1,"bestLapTimeMs",millis(progress.get(id).best),"valid",Double.isFinite(progress.get(id).best)));}
        event("qualifying_result",Map.of("grid",times));
    }
    private List<String> orderedStandings() {
        return participants.keySet().stream().sorted(Comparator
                .comparing((String id)->!Double.isFinite(progress.get(id).finishAt))
                .thenComparingDouble(id->progress.get(id).finishAt)
                .thenComparing(Comparator.comparingDouble((String id)->progress.get(id).gates.validProgress()).reversed())
                .thenComparingLong(id->progress.get(id).progressAt).thenComparing(id->id)).toList();
    }
    private void finishRace() {
        List<String> order=orderedStandings();List<Standing> standings=new ArrayList<>();
        for(int i=0;i<order.size();i++) {
            String id=order.get(i);var p=progress.get(id);var participant=participants.get(id);
            standings.add(new Standing(id,participant.userId(),participant.displayName(),i+1,
                    millis(Double.isFinite(p.finishAt)?p.finishAt:raceSteps),millis(p.best),Double.isFinite(p.finishAt),p.gates.laps(),p.gates.validProgress()));
        }
        result=new Result(raceId,track.id,track.catalogVersion,contract.version(),List.copyOf(standings));
        setPhase(Phase.RESULTS);
        // The runtime persists this result transactionally before publishing race_result.
        events.add(new Event("race_result",result));
    }
    private void setPhase(Phase next){phase=next;phaseSteps=0;event("session_phase",Map.of("phase",next.name().toLowerCase(Locale.ROOT)));}
    private void event(String type,Map<String,?> data) {
        Map<String,Object> payload=new LinkedHashMap<>(data);payload.put("type",type);payload.put("serverTime",serverTime());payload.put("sessionId",raceId);payload.put("tick",steps/4);payload.put("substep",steps);
        events.add(new Event("race_event",Map.copyOf(payload)));
    }
    private long serverTime(){return epochMillis+steps*1000/HZ;}
    private static long millis(double steps){return Double.isFinite(steps)?Math.round(steps*1000/HZ):0;}
    public List<Event> drainEvents(){List<Event> copy=List.copyOf(events);events.clear();return copy;}
    public Snapshot snapshot() {
        var physical=engine.snapshot(serverTime());List<Car> cars=new ArrayList<>();
        List<String> order=orderedStandings();
        for(var c:physical.cars()) {
            var p=progress.get(c.playerId());
            cars.add(new Car(c.playerId(),c.x(),c.y(),c.velocityX(),c.velocityY(),c.angle(),c.speed(),c.physicsState(),c.damageState(),
                    c.trackDistanceMeters(),c.trackLayer(),c.lastProcessedClientSeq(),p.gates.laps(),Double.isFinite(p.finishAt),p.lockRemaining>0,track.inPit(new Vec2(c.x(),c.y())),
                    order.indexOf(c.playerId())+1,p.gates.nextCheckpoint(),p.qualifyingAttempts,
                    p.lapStarted<0 || phase==Phase.QUALIFYING && p.qualifyingAttempts>=QUALIFYING_LAPS || Double.isFinite(p.finishAt)?0:
                            millis(Math.max(0,(phase==Phase.QUALIFYING?phaseSteps:raceSteps)-p.lapStarted)),millis(p.best)));
        }
        return new Snapshot(raceId,steps/4,steps,physical.tick()*4,serverTime(),track.id,track.catalogVersion,contract.version(),phase.name().toLowerCase(Locale.ROOT),lapLimit,millis(raceSteps),List.copyOf(cars));
    }
}
