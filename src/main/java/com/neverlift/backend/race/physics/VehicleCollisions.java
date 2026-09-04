package com.neverlift.backend.race.physics;

import java.util.*;
import java.util.function.Function;
import java.util.function.BiConsumer;
import static java.lang.Math.*;
import static com.neverlift.backend.race.physics.CollisionGeometry.*;
import static com.neverlift.backend.race.physics.CollisionSolver.*;
import static com.neverlift.backend.race.physics.ContinuousCollision.*;

/** Canonical per-substep CCD orchestrator, with impact damage emitted separately. */
public final class VehicleCollisions {
    public final CollisionGeometry geometry;
    public final CollisionSolver solver;
    public final ContinuousCollision ccd;
    private final PhysicsContract contract;
    private final double timeEpsilon,angularEpsilon,radius;
    private final int maxEvents;
    public VehicleCollisions(PhysicsContract c) {
        contract=c; geometry=new CollisionGeometry(c); solver=new CollisionSolver(c,geometry); ccd=new ContinuousCollision(c,geometry);
        timeEpsilon=c.number("collision","ccdTimeEpsilonSeconds"); angularEpsilon=c.number("collision","ccdAngularMotionEpsilonRadians");
        radius=VehicleIntegrator.scaledHypot(c.number("vehicle","lengthMeters")/2,c.number("vehicle","widthMeters")/2);
        maxEvents=(int)c.number("collision","maximumCcdEventsPerStep");
    }
    Body body(VehicleState s) { return new Body(new Vec2(s.x,s.y),new Vec2(s.velocityX,s.velocityY),s.angle,s.yawRate,1/contract.number("vehicle","massKg"),1/contract.number("vehicle","yawInertiaKgM2")); }
    public static Body wall() { return new Body(Vec2.ZERO,Vec2.ZERO,0,0,0,0); }
    static double positiveAngle(double angle) { double result=angle%(PI*2); return result<0?result+PI*2:result; }
    static double angleDelta(double from,double to) {
        double delta=positiveAngle(to)-positiveAngle(from); return delta>PI?delta-PI*2:delta < -PI?delta+PI*2:delta;
    }
    void sync(VehicleState s,Body b) { s.x=b.position.x();s.y=b.position.y();s.velocityX=b.velocity.x();s.velocityY=b.velocity.y();s.angle=positiveAngle(b.angle);s.yawRate=b.angularVelocity; }
    void advance(Body b,double dt) { b.position=b.position.add(b.velocity.scale(dt)); b.angle=positiveAngle(b.angle+b.angularVelocity*dt); }
    Motion motion(Body b) { return new Motion(geometry.vehicle(b.position,b.angle),b.position,b.velocity,b.angularVelocity); }
    Bounds swept(Vec2 from,Vec2 to) { return new Bounds(min(from.x(),to.x())-radius,min(from.y(),to.y())-radius,max(from.x(),to.x())+radius,max(from.y(),to.y())+radius); }
    List<Manifold> complete(List<Manifold> current,List<Manifold> reported) {
        Map<String,Manifold> result=new TreeMap<>();
        for(Manifold m:current) result.put(m.firstId()+":"+m.secondId(),m);
        for(Manifold m:reported) result.putIfAbsent(m.firstId()+":"+m.secondId(),m);
        return result.values().stream().sorted(ORDER).toList();
    }
    boolean shouldSweep(Vec2 velocity,double yaw,double dt) { return velocity.length()>=contract.number("collision","ccdMinimumSpeedMetersPerSecond") || abs(yaw)*dt>angularEpsilon; }
    public boolean againstBarriers(VehicleState s,double dt,Function<Bounds,List<Shape>> provider,BiConsumer<VehicleState,Double> damage) {
        Vec2 intended=new Vec2(s.x,s.y),previous=new Vec2(s.previousX,s.previousY);
        if(provider.apply(swept(previous,intended)).isEmpty()) return false;
        if(dt<=0) {
            Body b=body(s); List<Manifold> contacts=geometry.compound(geometry.vehicle(b.position,b.angle),provider.apply(swept(intended,intended)));
            if(contacts.isEmpty()) return false;
            Resolution r=solver.solve(b,wall(),contacts,solver::barrierOptions);sync(s,b);damage.accept(s,r.firstNormalDeltaV());return true;
        }
        Vec2 travel=intended.sub(previous).scale(1/dt);
        double travelYaw=angleDelta(s.previousAngle,s.angle)/dt;
        Body b=body(s);b.position=previous;b.angle=positiveAngle(s.previousAngle);
        double remaining=dt;boolean collided=false;
        for(int event=0;event<maxEvents && remaining>timeEpsilon;event++) {
            Vec2 predicted=b.position.add(travel.scale(remaining));
            List<Shape> barriers=provider.apply(swept(b.position,predicted));
            if(barriers.isEmpty()) { b.position=predicted;b.angle=positiveAngle(b.angle+travelYaw*remaining);remaining=0;break; }
            List<Shape> shapes=geometry.vehicle(b.position,b.angle);
            List<Manifold> start=geometry.compound(shapes,barriers);
            Impact hit=start.isEmpty() && shouldSweep(travel,travelYaw,remaining)
                    ? ccd.sweep(new Motion(shapes,b.position,travel,travelYaw),new Motion(barriers,Vec2.ZERO,Vec2.ZERO,0),remaining):null;
            if(start.isEmpty() && hit==null) {
                b.position=predicted;b.angle=positiveAngle(b.angle+travelYaw*remaining);
                List<Manifold> end=geometry.compound(geometry.vehicle(b.position,b.angle),barriers);
                if(!end.isEmpty()) { Resolution r=solver.solve(b,wall(),end,solver::barrierOptions);damage.accept(s,r.firstNormalDeltaV());collided=true; }
                remaining=0;break;
            }
            double elapsed=hit==null?0:hit.time();b.position=b.position.add(travel.scale(elapsed));b.angle=positiveAngle(b.angle+travelYaw*elapsed);remaining=max(0,remaining-elapsed);
            List<Manifold> contacts=start.isEmpty()?geometry.compound(geometry.vehicle(b.position,b.angle),barriers):start;
            if(hit!=null && start.isEmpty()) contacts=complete(contacts,hit.manifolds());
            if(contacts.isEmpty()) contacts=hit.manifolds();
            Resolution r=solver.solve(b,wall(),contacts,solver::barrierOptions);damage.accept(s,r.firstNormalDeltaV());collided=true;
            travel=b.velocity;travelYaw=b.angularVelocity;
            if(elapsed<=timeEpsilon) { double escape=min(remaining,timeEpsilon);advance(b,escape);remaining-=escape; }
        }
        if(remaining>0) advance(b,remaining);sync(s,b);return collided;
    }
    public boolean pair(VehicleState a,VehicleState b,double dt,BiConsumer<VehicleState,Double> damage) {
        Vec2 ap=new Vec2(a.x,a.y),bp=new Vec2(b.x,b.y),as=new Vec2(a.previousX,a.previousY),bs=new Vec2(b.previousX,b.previousY);
        if(!swept(ap,ap).intersects(swept(bp,bp),0) && (dt<=0 || !swept(as,ap).intersects(swept(bs,bp),0))) return false;
        Body ab=body(a),bb=body(b);
        Impact hit=null;
        if(dt>0) {
            Vec2 av=ap.sub(as).scale(1/dt),bv=bp.sub(bs).scale(1/dt);
            double ay=angleDelta(a.previousAngle,a.angle)/dt,by=angleDelta(b.previousAngle,b.angle)/dt;
            if(shouldSweep(av.sub(bv),abs(ay)+abs(by),dt)) hit=ccd.sweep(
                    new Motion(geometry.vehicle(as,a.previousAngle),as,av,ay),new Motion(geometry.vehicle(bs,b.previousAngle),bs,bv,by),dt);
        }
        if(hit==null) {
            List<Manifold> contacts=geometry.compound(geometry.vehicle(ap,a.angle),geometry.vehicle(bp,b.angle));if(contacts.isEmpty()) return false;
            resolvePair(a,b,ab,bb,contacts,damage);return true;
        }
        double alpha=hit.time()/dt;
        ab.position=as.add(ap.sub(as).scale(alpha));bb.position=bs.add(bp.sub(bs).scale(alpha));
        ab.angle=positiveAngle(a.previousAngle+angleDelta(a.previousAngle,a.angle)*alpha);bb.angle=positiveAngle(b.previousAngle+angleDelta(b.previousAngle,b.angle)*alpha);
        double remaining=dt-hit.time();List<Manifold> pending=hit.manifolds();
        for(int event=0;pending!=null && event<maxEvents;event++) {
            List<Manifold> contacts=complete(geometry.compound(geometry.vehicle(ab.position,ab.angle),geometry.vehicle(bb.position,bb.angle)),pending);
            resolvePair(a,b,ab,bb,contacts.isEmpty()?pending:contacts,damage);
            if(remaining<=timeEpsilon) break;
            Impact next=ccd.sweep(motion(ab),motion(bb),remaining);
            if(next==null) { advance(ab,remaining);advance(bb,remaining);remaining=0;break; }
            advance(ab,next.time());advance(bb,next.time());remaining-=next.time();pending=next.manifolds();
            if(next.time()<=timeEpsilon) { double escape=min(remaining,timeEpsilon);advance(ab,escape);advance(bb,escape);remaining-=escape; }
        }
        if(remaining>0) { advance(ab,remaining);advance(bb,remaining); }sync(a,ab);sync(b,bb);return true;
    }
    void resolvePair(VehicleState a,VehicleState b,Body ab,Body bb,List<Manifold> contacts,BiConsumer<VehicleState,Double> damage) {
        Resolution r=solver.solve(ab,bb,contacts,ignored->solver.carOptions());sync(a,ab);sync(b,bb);
        damage.accept(a,r.firstNormalDeltaV());damage.accept(b,r.secondNormalDeltaV());
    }
}
