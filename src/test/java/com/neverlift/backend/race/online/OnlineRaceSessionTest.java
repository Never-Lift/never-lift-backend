package com.neverlift.backend.race.online;

import com.neverlift.backend.race.physics.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class OnlineRaceSessionTest {
    final PhysicsContract c=new PhysicsContract();
    OnlineRaceSession session() {return new OnlineRaceSession(c,ShortTrack.definition(),List.of(
            new OnlineRaceSession.Participant("a",UUID.randomUUID(),"A","#a84448",false),
            new OnlineRaceSession.Participant("b",UUID.randomUUID(),"B","#365f82",false)),2,"normal",0);}
    // Rule unit tests inject authoritative poses at the orchestration boundary. E2E uses real integration.
    void driveRules(OnlineRaceSession s,int laps) {
        var a=new VehicleState("a",c);var b=new VehicleState("b",c);
        for(double d=-2;d<laps*ShortTrack.LENGTH+2;d+=1) {
            for(var car:List.of(a,b)){var from=ShortTrack.point(d);var to=ShortTrack.point(d+1);car.previousX=from.x();car.previousY=from.y();car.x=to.x();car.y=to.y();}
            s.beforeStep();s.afterStep(Map.of("a",a,"b",b));
        }
    }
    OnlineRaceSession raceCountdown() {
        var s=session();for(int i=0;i<90;i++)s.tick(0);driveRules(s,2);
        assertThat(s.phase()).isEqualTo(OnlineRaceSession.Phase.QUALIFYING_RESULTS);
        s.startRace();s.drainEvents();return s;
    }
    @Test void qualifyingAllowsExactlyTwoAttemptsAndHasNoTimer() {
        var s=session();for(int i=0;i<6000;i++)s.tick(0);
        assertThat(s.phase()).isEqualTo(OnlineRaceSession.Phase.QUALIFYING);
        driveRules(s,2);assertThat(s.phase()).isEqualTo(OnlineRaceSession.Phase.QUALIFYING_RESULTS);
        assertThat(s.snapshot().cars()).allMatch(car->car.qualifyingAttempts()==2 && car.bestLapTimeMs()>0);
    }
    @Test void fiveLightsAreSpacedBy120SubstepsAndReleaseAfterTheLastDelay() {
        var s=raceCountdown();List<OnlineRaceSession.Event> events=new ArrayList<>();
        for(int i=0;i<150;i++){s.tick(0);events.addAll(s.drainEvents());}
        assertThat(s.phase()).isEqualTo(OnlineRaceSession.Phase.COUNTDOWN);
        var lights=events.stream().map(e->(Map<?,?>)e.payload()).filter(p->"start_light".equals(p.get("type"))).toList();
        assertThat(lights).extracting(p->((Number)p.get("stage")).intValue()).containsExactly(1,2,3,4,5);
        long first=((Number)lights.getFirst().get("substep")).longValue();
        for(int i=0;i<5;i++)assertThat(((Number)lights.get(i).get("substep")).longValue()-first).isEqualTo(i*120);
        s.tick(0);assertThat(s.phase()).isEqualTo(OnlineRaceSession.Phase.RACE);
    }
    @Test void evenAShortEarlyThrottlePulseLocksExactly600ActualSubsteps() {
        var s=raceCountdown();assertThat(s.input("a",new DriverInput(.001,0,0),1,0)).isTrue();
        s.input("a",DriverInput.NEUTRAL,2,0);
        for(int i=0;i<150;i++)s.tick(0);
        assertThat(s.snapshot().cars().getFirst().falseStart()).isTrue();
        for(int i=0;i<150;i++) {
            s.input("a",new DriverInput(1,0,0),3+i,0);s.tick(0);
            assertThat(s.snapshot().cars().getFirst().physicsState().appliedThrottle()).isZero();
        }
        assertThat(s.blockedSteps("a")).isEqualTo(600);
        assertThat(s.snapshot().cars().getFirst().falseStart()).isFalse();
        s.tick(0);assertThat(s.blockedSteps("a")).isEqualTo(600);
        assertThat(s.snapshot().cars().getFirst().physicsState().appliedThrottle()).isPositive();
    }
    @Test void resultHasSortedStandingsAndFinishingChangesCollisionGroup() {
        var s=raceCountdown();for(int i=0;i<151;i++)s.tick(0);
        assertThat(s.pairAllowed("a","b")).isTrue();driveRules(s,2);
        assertThat(s.result()).isNotNull();assertThat(s.result().standings()).extracting(OnlineRaceSession.Standing::position).containsExactly(1,2);
        assertThat(s.result().standings()).allMatch(r->r.finished() && r.laps()==2 && r.totalTimeMs()>0);
        assertThat(s.snapshot().cars()).allMatch(OnlineRaceSession.Car::isGhost);
        assertThat(s.drainEvents()).filteredOn(e->e.type().equals("race_result")).hasSize(1);
    }
    @Test void replacementUsesSameCarAndReconnectRestoresHumanInput() {
        var s=raceCountdown();for(int i=0;i<151;i++)s.tick(0);
        String id=s.snapshot().cars().getFirst().playerId();s.connected(id,false);
        for(int i=0;i<30;i++)s.tick(0);
        assertThat(s.substituted(id)).isTrue();assertThat(s.input(id,new DriverInput(1,0,0),1,0)).isFalse();
        var before=s.snapshot().cars().getFirst();assertThat(before.speed()).isPositive();
        s.connected(id,true);assertThat(s.input(id,DriverInput.NEUTRAL,2,0)).isTrue();s.tick(0);
        assertThat(s.substituted(id)).isFalse();assertThat(s.snapshot().cars().getFirst().playerId()).isEqualTo(before.playerId());
        assertThat(s.snapshot().cars().getFirst().lastProcessedClientSeq()).isEqualTo(2);
    }
    @Test void safetyLimitCreatesDnfResultsAndReturnsToLobbyAfter60Seconds() {
        var s=raceCountdown();for(int i=0;i<151+180*30;i++)s.tick(0);
        assertThat(s.result().standings()).allMatch(r->!r.finished());
        for(int i=0;i<60*30;i++)s.tick(0);
        assertThat(s.phase()).isEqualTo(OnlineRaceSession.Phase.LOBBY);
    }
}
