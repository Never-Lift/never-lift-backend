package com.neverlift.backend.race.physics;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.neverlift.backend.race.physics.CollisionGeometry.*;
import static com.neverlift.backend.race.physics.CollisionSolver.*;
import static com.neverlift.backend.race.physics.ContinuousCollision.*;

class CollisionTest {
    final PhysicsContract c=new PhysicsContract();final VehicleCollisions collisions=new VehicleCollisions(c);
    Shape wall(double x){return new Shape("wall","concrete-wall",List.of(new Vec2(x,-20),new Vec2(x+0.35,-20),new Vec2(x+0.35,20),new Vec2(x,20)));}
    @Test void highSpeedThinWallCcdHasNoTunnelingAndNoEarlyInvisibleHit() {
        var g=collisions.geometry;var shapes=g.vehicle(Vec2.ZERO,0);Shape wall=wall(10);
        var impact=collisions.ccd.sweep(new Motion(shapes,Vec2.ZERO,new Vec2(120,0),0),new Motion(List.of(wall),Vec2.ZERO,Vec2.ZERO,0),0.1);
        assertThat(impact).isNotNull();double nose=shapes.stream().flatMap(s->s.vertices().stream()).mapToDouble(Vec2::x).max().orElseThrow();
        assertThat(impact.time()).isCloseTo((10-nose)/120,within(1e-8));
        assertThat(g.compound(g.vehicle(new Vec2(120*(impact.time()-0.001),0),0),List.of(wall))).isEmpty();
        VehicleState car=new VehicleState("ccd",c);car.previousX=0;car.x=12;car.velocityX=120;
        collisions.againstBarriers(car,0.1,ignored->List.of(wall),new VehicleIntegrator(c)::recordNormalImpact);
        assertThat(car.x).isLessThan(10);assertThat(car.damageState.impactCount).isPositive();
    }
    @Test void rotationalCcdFindsActualWingContactAndNotOnlySweptBoundingBox() {
        Shape bar=new Shape("wing",null,List.of(new Vec2(-3,-0.1),new Vec2(3,-0.1),new Vec2(3,0.1),new Vec2(-3,0.1)));
        Shape obstacle=new Shape("obstacle","concrete-wall",List.of(new Vec2(-0.2,2.7),new Vec2(0.2,2.7),new Vec2(0.2,3.1),new Vec2(-0.2,3.1)));
        var hit=collisions.ccd.sweep(new Motion(List.of(bar),Vec2.ZERO,Vec2.ZERO,Math.PI),new Motion(List.of(obstacle),Vec2.ZERO,Vec2.ZERO,0),1);
        assertThat(hit).isNotNull();assertThat(hit.time()).isBetween(0.3,0.6);
        assertThat(collisions.geometry.sat(bar.transform(Vec2.ZERO,Math.PI*hit.time()),obstacle)).isNotNull();
        assertThat(collisions.ccd.sweep(new Motion(List.of(bar),Vec2.ZERO,Vec2.ZERO,Math.PI),new Motion(List.of(obstacle.translate(new Vec2(0,3))),Vec2.ZERO,Vec2.ZERO,0),1)).isNull();
    }
    @Test void centralImpactHasNoTorqueButOffCenterImpactDoesAndFrictionIsNotDamage() {
        Body center=new Body(Vec2.ZERO,new Vec2(4.5,20),0,0,1,1),rigid=VehicleCollisions.wall();
        Manifold contact=new Manifold(new Vec2(1,0),0,List.of(new Vec2(2.8,0)),"nose","wall",null,"concrete-wall");
        var result=collisions.solver.solveOne(center,rigid,contact,new Options(0.08,0.65,0,0));
        assertThat(result.firstNormalDeltaV()).isCloseTo(4.86,within(1e-12));
        assertThat(center.velocity.sub(new Vec2(4.5,20)).length()).isGreaterThan(c.number("damage","minimumDeltaVMetersPerSecond"));
        VehicleState car=new VehicleState("scrape",c);new VehicleIntegrator(c).recordNormalImpact(car,result.firstNormalDeltaV());assertThat(car.damageState.health).isEqualTo(100);
        Body straight=new Body(Vec2.ZERO,new Vec2(15,0),0,0,1,1);
        collisions.solver.solveOne(straight,rigid,contact,new Options(0.08,0,0,0));assertThat(straight.angularVelocity).isZero();
        Body oblique=new Body(Vec2.ZERO,new Vec2(15,0),0,0,1,1);
        collisions.solver.solveOne(oblique,rigid,contact.withContacts(List.of(new Vec2(2.8,0.8))),new Options(0.08,0,0,0));assertThat(oblique.angularVelocity).isNotZero();
    }
    @Test void compoundContactsAndSolverAreIndependentOfInputObjectOrder() {
        var g=collisions.geometry;List<Shape> first=new ArrayList<>(g.vehicle(Vec2.ZERO,0)),second=new ArrayList<>(g.vehicle(new Vec2(4.9,0.4),Math.PI));
        var contacts=g.compound(first,second);assertThat(contacts).isNotEmpty();Collections.reverse(first);Collections.reverse(second);
        assertThat(g.compound(first,second)).isEqualTo(contacts);
        Body a=new Body(Vec2.ZERO,new Vec2(20,1),0,0,1,1),b=new Body(new Vec2(4.9,0.4),new Vec2(-20,0),0,0,1,1);
        Body aa=new Body(a.position,a.velocity,0,0,1,1),bb=new Body(b.position,b.velocity,0,0,1,1);
        var reversed=new ArrayList<>(contacts);Collections.reverse(reversed);
        assertThat(collisions.solver.solve(a,b,contacts,ignored->collisions.solver.carOptions())).isEqualTo(collisions.solver.solve(aa,bb,reversed,ignored->collisions.solver.carOptions()));
        assertThat(a).usingRecursiveComparison().isEqualTo(aa);assertThat(b).usingRecursiveComparison().isEqualTo(bb);
    }
}
