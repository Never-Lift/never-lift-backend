package com.neverlift.backend.race.physics;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class RaceEngineTest {
    final PhysicsContract c=new PhysicsContract();
    final TrackGeometry track=new TrackGeometry(c,PhysicsContract.resource("tracks/albert-park.json"));
    RaceEngine.Entrant entrant(String id,int slot,boolean bot){return new RaceEngine.Entrant(id,bot,"normal",track.spawn(slot));}
    @Test void exactlyFourCanonicalFifteenStageSubstepsPerTick() {
        List<Integer> trace=new ArrayList<>();RaceEngine engine=new RaceEngine(c,track,List.of(entrant("car",0,false)),(id,stage)->trace.add(stage));
        engine.acceptInput("car",new DriverInput(1,0,0),1,0);engine.tick(0);
        List<Integer> expected=new ArrayList<>();for(int sub=0;sub<4;sub++)for(int stage=1;stage<=15;stage++)expected.add(stage);
        assertThat(trace).isEqualTo(expected);assertThat(engine.snapshot(0).tick()).isEqualTo(1);
        assertThat(engine.snapshot(0).cars().getFirst().physicsState().appliedThrottle()).isGreaterThan(0);
    }
    @Test void inputIsHeldThenNeutralizedThroughTheSameRampAndOldSequenceCannotOverwriteIt() {
        RaceEngine e=new RaceEngine(c,track,List.of(entrant("car",0,false)));
        e.acceptInput("car",new DriverInput(10,-10,0),2,0);
        for(int tick=0;tick<6;tick++)e.tick(tick*33_333_333L);
        double applied=e.snapshot(0).cars().getFirst().physicsState().appliedThrottle();
        assertThat(applied).isCloseTo(24*c.stepSeconds()*c.number("controls","throttleRisePerSecond"),within(1e-12));
        e.acceptInput("car",DriverInput.NEUTRAL,1,190_000_000L);e.tick(199_000_000L);
        assertThat(e.snapshot(0).cars().getFirst().physicsState().appliedThrottle()).isGreaterThanOrEqualTo(applied);
        e.tick(RaceEngine.INPUT_HOLD_NANOS+1);
        assertThat(e.snapshot(0).cars().getFirst().physicsState().appliedThrottle()).isBetween(0.01,applied);
        for(int tick=0;tick<20;tick++)e.tick(1_000_000_000L);
        assertThat(e.snapshot(0).cars().getFirst().physicsState().appliedThrottle()).isZero();
        assertThat(e.snapshot(0).cars().getFirst().lastProcessedClientSeq()).isEqualTo(2);
    }
    @Test void twentyTwoCarsBotsAndHumansUseIdenticalInputIntegratorAndStableOrdering() {
        List<RaceEngine.Entrant> entrants=new ArrayList<>();for(int i=0;i<22;i++)entrants.add(entrant("car-"+i,i,i>0));
        RaceEngine a=new RaceEngine(c,track,entrants);Collections.reverse(entrants);RaceEngine b=new RaceEngine(c,track,entrants);
        for(int tick=0;tick<30;tick++){a.tick(tick*33_333_333L);b.tick(tick*33_333_333L);}
        assertThat(a.snapshot(1)).isEqualTo(b.snapshot(1));assertThat(a.snapshot(1).cars()).hasSize(22);
        assertThat(a.snapshot(1).cars().stream().filter(car->!car.playerId().equals("car-0"))).allMatch(car->car.speed()>0);
        assertThat(a.acceptInput("car-1",new DriverInput(1,0,0),1,0)).isFalse();
        // Difficulty has no slot in the integrator API: replaying a bot's decision as human is bit-for-bit identical.
        BotPlanner planner=new BotPlanner(c);VehicleIntegrator integrator=new VehicleIntegrator(c);
        for(String difficulty:List.of("easy","normal","hard")) {
            VehicleState bot=new VehicleState("same",c),human=new VehicleState("same",c);
            var spawn=track.spawn(0);bot.x=human.x=spawn.position().x();bot.y=human.y=spawn.position().y();bot.angle=human.angle=spawn.angle();
            DriverInput decision=planner.plan(bot,track,track.project(spawn.position(),null).distance(),0,difficulty);
            integrator.integrate(bot,decision,"asphalt");integrator.integrate(human,decision,"asphalt");
            assertThat(bot).usingRecursiveComparison().isEqualTo(human);
        }
    }
    @Test void snapshotsAreImmutableCopiesAndMembershipRemovalOccursOnlyOnOwnerTick() {
        RaceEngine e=new RaceEngine(c,track,List.of(entrant("a",0,false),entrant("b",1,false)));
        var before=e.snapshot(0);e.retainParticipants(Set.of("b"));e.tick(0);
        assertThat(before.cars()).hasSize(2);assertThat(e.snapshot(0).cars()).extracting(RaceEngine.CarSnapshot::playerId).containsExactly("b");
        assertThatThrownBy(()->before.cars().clear()).isInstanceOf(UnsupportedOperationException.class);
    }
}
