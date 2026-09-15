package com.neverlift.backend.race.online;

import com.neverlift.backend.race.physics.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class TrackProgressTest {
    final PhysicsContract c=new PhysicsContract();
    TrackProgress progress(){return new TrackProgress(new TrackGeometry(c,ShortTrack.definition()),ShortTrack.definition(),c);}
    void drive(TrackProgress p,double from,double to) {
        double sign=Math.signum(to-from);
        for(double d=from;sign*(to-d)>0;d+=sign) p.advance(ShortTrack.point(d),ShortTrack.point(d+sign));
    }
    @Test void onlyOrderedDirectionalCheckpointsCountACompleteLap() {
        var p=progress();drive(p,-2,ShortTrack.LENGTH+2);
        assertThat(p.laps()).isEqualTo(1);assertThat(p.nextCheckpoint()).isZero();
    }
    @Test void backwardsDrivingAndFinishWithoutAllGatesCannotEarnLaps() {
        var p=progress();drive(p,2,-ShortTrack.LENGTH-2);assertThat(p.laps()).isZero();
        p=progress();p.advance(ShortTrack.point(-1),ShortTrack.point(1));
        p.advance(ShortTrack.point(ShortTrack.LENGTH-1),ShortTrack.point(ShortTrack.LENGTH+1));
        assertThat(p.laps()).isZero();
    }
    @Test void cutRequiresReturnAndInvalidatesTheQualifyingLap() {
        var p=progress();drive(p,-2,20);
        double bank=p.validProgress();
        p.advance(ShortTrack.point(20),ShortTrack.point(40).scale(2));
        p.advance(ShortTrack.point(40).scale(2),ShortTrack.point(80));
        assertThat(p.validProgress()).isEqualTo(bank);assertThat(p.invalidLap()).isTrue();
        p.advance(ShortTrack.point(80),ShortTrack.point(20));drive(p,20,ShortTrack.LENGTH+2);
        assertThat(p.laps()).isZero();
        drive(p,ShortTrack.LENGTH+2,2*ShortTrack.LENGTH+2);assertThat(p.laps()).isEqualTo(1);
    }
    @Test void gateCrossingOutsideWidthOrWrongDirectionIsRejected() {
        var gate=new TrackProgress.Gate(Vec2.ZERO,new Vec2(1,0),5,0);
        assertThat(gate.crossing(new Vec2(-1,0),new Vec2(1,0),0)).isEqualTo(.5);
        assertThat(gate.crossing(new Vec2(1,0),new Vec2(-1,0),0)).isNaN();
        assertThat(gate.crossing(new Vec2(-1,6),new Vec2(1,6),0)).isNaN();
    }
}
