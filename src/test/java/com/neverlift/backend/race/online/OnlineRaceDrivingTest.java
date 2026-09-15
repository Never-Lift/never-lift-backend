package com.neverlift.backend.race.online;

import com.neverlift.backend.race.physics.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class OnlineRaceDrivingTest {
    @Test void canonicalBotsActuallyCompleteQualifyingAndTwoLapRaceOnShortTrack() {
        var contract=new PhysicsContract();
        var session=new OnlineRaceSession(contract,ShortTrack.definition(),List.of(
                new OnlineRaceSession.Participant("a",null,"A","#a84448",true),
                new OnlineRaceSession.Participant("b",null,"B","#365f82",true)),2,"normal",0);
        for(int tick=0;tick<18000 && session.phase()==OnlineRaceSession.Phase.QUALIFYING;tick++){session.tick(tick*33_333_333L);session.drainEvents();}
        assertThat(session.phase()).withFailMessage("Qualifying stuck: %s",session.snapshot()).isEqualTo(OnlineRaceSession.Phase.QUALIFYING_RESULTS);
        assertThat(session.snapshot().cars()).allMatch(car->car.qualifyingAttempts()==2 && car.bestLapTimeMs()>0);
        session.startRace();
        for(int tick=0;tick<10000 && session.result()==null;tick++){session.tick(tick*33_333_333L);session.drainEvents();}
        assertThat(session.result()).isNotNull();
        assertThat(session.result().standings()).allMatch(s->s.finished() && s.laps()==2);
        System.out.println("M3C REAL PHYSICS SHORT TRACK: "+session.result());
    }
}
