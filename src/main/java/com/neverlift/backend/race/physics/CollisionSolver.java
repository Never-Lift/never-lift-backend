package com.neverlift.backend.race.physics;

import java.util.*;
import java.util.function.Function;
import static java.lang.Math.*;
import static com.neverlift.backend.race.physics.CollisionGeometry.*;

/** Impulses at contact centroids, preserving the frozen compound-patch solver. */
public final class CollisionSolver {
    public static final class Body {
        public Vec2 position, velocity;
        public double angle, angularVelocity;
        public final double inverseMass, inverseInertia;
        public Body(Vec2 position, Vec2 velocity, double angle, double yaw, double inverseMass, double inverseInertia) {
            this.position=position; this.velocity=velocity; this.angle=angle; angularVelocity=yaw;
            this.inverseMass=inverseMass; this.inverseInertia=inverseInertia;
        }
        public Vec2 velocityAt(Vec2 radius) { return velocity.add(radius.left().scale(angularVelocity)); }
        void impulse(Vec2 impulse, Vec2 radius) { velocity=velocity.add(impulse.scale(inverseMass)); angularVelocity+=radius.cross(impulse)*inverseInertia; }
    }
    public record Options(double restitution, double friction, double correction, double slop) {}
    public record Resolution(double impactSpeed, double normalImpulse, double frictionImpulse, double firstNormalDeltaV, double secondNormalDeltaV) {}
    private final PhysicsContract contract;
    private final CollisionGeometry geometry;
    private final Map<String,Options> barrierOptions;
    public CollisionSolver(PhysicsContract contract, CollisionGeometry geometry) {
        this.contract=contract; this.geometry=geometry;
        Map<String,Options> materials=new HashMap<>();
        contract.section("collision").path("barrierMaterials").fields().forEachRemaining(entry -> materials.put(entry.getKey(),
                options(PhysicsContract.requiredNumber(entry.getValue(),"restitution"),PhysicsContract.requiredNumber(entry.getValue(),"tangentialFriction"))));
        barrierOptions=Map.copyOf(materials);
    }
    public Options carOptions() { return options(contract.number("collision","carRestitution"),contract.number("collision","carTangentialFriction")); }
    Options options(double restitution,double friction) { return new Options(restitution,friction,contract.number("collision","positionCorrectionPercent"),contract.number("collision","penetrationSlopMeters")); }
    public Options barrierOptions(Manifold m) {
        if (m.secondMaterial()==null) throw new IllegalArgumentException("Missing canonical barrier material");
        Options options=barrierOptions.get(m.secondMaterial());
        if(options==null)throw new IllegalArgumentException("Unknown barrier material: "+m.secondMaterial());
        return options;
    }
    Vec2 contact(Body a,Body b,Manifold m) { return m.contacts().isEmpty()?a.position.add(b.position).scale(0.5):centroid(m.contacts()); }
    double normalVelocity(Body a,Body b,Manifold m) { Vec2 c=contact(a,b,m); return b.velocityAt(c.sub(b.position)).sub(a.velocityAt(c.sub(a.position))).dot(m.normal()); }
    boolean samePatch(Body a,Body b,Manifold x,Manifold y) {
        return geometry.shareContact(x,y) || (abs(contact(a,b,y).sub(contact(a,b,x)).dot(x.normal()))<=geometry.mergeDistance
                && abs(normalVelocity(a,b,y)-normalVelocity(a,b,x))<=contract.number("collision","contactPatchNormalVelocityMergeMetersPerSecond"));
    }
    List<Manifold> patches(Body a,Body b,List<Manifold> manifolds) {
        List<List<Manifold>> clusters=new ArrayList<>();
        for (Manifold m:manifolds.stream().sorted(ORDER).toList()) {
            List<Manifold> cluster=clusters.stream().filter(c -> c.getFirst().normal().dot(m.normal())>=geometry.normalMergeCosine
                    && Objects.equals(c.getFirst().firstMaterial(),m.firstMaterial()) && Objects.equals(c.getFirst().secondMaterial(),m.secondMaterial())
                    && c.stream().anyMatch(x -> samePatch(a,b,x,m))).findFirst().orElse(null);
            if (cluster==null) { cluster=new ArrayList<>(); clusters.add(cluster); } cluster.add(m);
        }
        return clusters.stream().map(geometry::representative).sorted(ORDER).toList();
    }
    public Resolution solve(Body a,Body b,List<Manifold> manifolds,Function<Manifold,Options> options) {
        List<Manifold> ordered=patches(a,b,manifolds);
        Vec2 normalImpulseVector=Vec2.ZERO;
        double impulseSum=0,frictionSum=0,impact=0;
        int iterations=(int)contract.number("collision","solverIterations");
        for (int iteration=0;iteration<iterations;iteration++) for (Manifold m:ordered) {
            Options o=options.apply(m);
            Resolution r=solveOne(a,b,m,new Options(o.restitution,o.friction,o.correction/iterations,o.slop));
            impact=max(impact,r.impactSpeed); impulseSum+=r.normalImpulse; frictionSum+=r.frictionImpulse;
            normalImpulseVector=normalImpulseVector.add(m.normal().scale(r.normalImpulse));
        }
        return new Resolution(impact,impulseSum,frictionSum,normalImpulseVector.length()*a.inverseMass,normalImpulseVector.length()*b.inverseMass);
    }
    public Resolution solveOne(Body a,Body b,Manifold m,Options o) {
        double inverseMass=a.inverseMass+b.inverseMass;
        if (inverseMass<=ulp(1.0)) return new Resolution(0,0,0,0,0);
        Vec2 correction=m.normal().scale(max(m.penetration()-o.slop,0)*o.correction/inverseMass);
        a.position=a.position.sub(correction.scale(a.inverseMass)); b.position=b.position.add(correction.scale(b.inverseMass));
        Vec2 c=contact(a,b,m),ra=c.sub(a.position),rb=c.sub(b.position);
        Vec2 relative=b.velocityAt(rb).sub(a.velocityAt(ra));
        double vn=relative.dot(m.normal()), la=ra.cross(m.normal()),lb=rb.cross(m.normal());
        double denominator=inverseMass+la*la*a.inverseInertia+lb*lb*b.inverseInertia;
        double normalImpulse=0,frictionImpulse=0;
        if (vn<0 && denominator>ulp(1.0)) {
            normalImpulse=-(1+o.restitution)*vn/denominator;
            Vec2 impulse=m.normal().scale(normalImpulse);
            a.impulse(impulse.scale(-1),ra); b.impulse(impulse,rb);
            Vec2 after=b.velocityAt(rb).sub(a.velocityAt(ra));
            Vec2 rawTangent=after.sub(m.normal().scale(after.dot(m.normal())));
            if (rawTangent.length()>geometry.epsilon) {
                Vec2 tangent=rawTangent.unit(); double ta=ra.cross(tangent),tb=rb.cross(tangent);
                double tangentDenominator=inverseMass+ta*ta*a.inverseInertia+tb*tb*b.inverseInertia;
                if (tangentDenominator>ulp(1.0)) {
                    double limit=normalImpulse*o.friction;
                    double friction=VehicleIntegrator.clamp(-after.dot(tangent)/tangentDenominator,-limit,limit);
                    Vec2 force=tangent.scale(friction); a.impulse(force.scale(-1),ra); b.impulse(force,rb); frictionImpulse=abs(friction);
                }
            }
        }
        return new Resolution(max(0,-vn),normalImpulse,frictionImpulse,normalImpulse*a.inverseMass,normalImpulse*b.inverseMass);
    }
}
