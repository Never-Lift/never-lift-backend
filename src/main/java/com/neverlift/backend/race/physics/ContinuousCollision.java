package com.neverlift.backend.race.physics;

import java.util.*;
import java.util.stream.Stream;
import static java.lang.Math.*;
import static com.neverlift.backend.race.physics.CollisionGeometry.*;

/** Exact translational swept SAT; rotational candidates must intersect at the real pose. */
public final class ContinuousCollision {
    public record Motion(List<Shape> shapes, Vec2 position, Vec2 velocity, double yaw) {}
    public record Impact(double time, List<Manifold> manifolds) {}
    record Pair(Shape first,Shape second) {}
    private final CollisionGeometry geometry;
    private final PhysicsContract contract;
    private final double epsilon,timeEpsilon;
    public ContinuousCollision(PhysicsContract c,CollisionGeometry g) {
        contract=c; geometry=g; epsilon=g.epsilon; timeEpsilon=c.number("collision","ccdTimeEpsilonSeconds");
    }
    Bounds sweptBounds(Shape s,Vec2 velocity,double time) { return bounds(s).union(bounds(s.translate(velocity.scale(time)))); }
    double radius(Shape s,Vec2 center) { double result=0;for(Vec2 v:s.vertices())result=max(result,v.sub(center).length());return result; }
    double radius(Motion m) { double result=0;for(Shape s:m.shapes)result=max(result,radius(s,m.position));return result; }
    Bounds motionBounds(Shape s,Motion m,double time) {
        double angle=abs(m.yaw)*time;
        return sweptBounds(s,m.velocity,time).expand(angle<=PI ? 2*radius(s,m.position)*PortableMath.sin(angle/2):2*radius(s,m.position));
    }
    Shape at(Shape s,Motion m,double time) {
        if (time<=timeEpsilon || (m.yaw==0 && m.velocity.x()==0 && m.velocity.y()==0)) return s;
        Vec2 position=m.position.add(m.velocity.scale(time));
        return s.pose(m.position,position,m.yaw*time);
    }
    public Impact linear(Shape a,Vec2 av,Shape b,Vec2 bv,double maxTime) {
        if (maxTime<0) throw new IllegalArgumentException("Negative CCD interval");
        Vec2 relative=bv.sub(av);
        if (!sweptBounds(a,av,maxTime).intersects(sweptBounds(b,bv,maxTime),epsilon)) return null;
        Manifold initial=geometry.sat(a,b);
        if (initial!=null) return initial.penetration()<=epsilon && relative.dot(initial.normal())>=0 ? null:new Impact(0,List.of(initial));
        double enter=0,exit=maxTime; Vec2 axisAtEntry=null;
        List<Vec2> firstAxes=geometry.axes(a),secondAxes=geometry.axes(b);
        for(int index=0;index<firstAxes.size()+secondAxes.size();index++) {
            Vec2 axis=index<firstAxes.size()?firstAxes.get(index):secondAxes.get(index-firstAxes.size());
            double[] pa=geometry.project(a.vertices(),axis),pb=geometry.project(b.vertices(),axis);
            double speed=relative.dot(axis);
            if (abs(speed)<=epsilon) { if (pa[1]<pb[0] || pb[1]<pa[0]) return null; continue; }
            double first=(pa[0]-pb[1])/speed,second=(pa[1]-pb[0])/speed;
            double entry=min(first,second);
            if (entry>enter) { enter=entry; axisAtEntry=axis; }
            exit=min(exit,max(first,second)); if (enter-exit>timeEpsilon) return null;
        }
        if (enter < -timeEpsilon || enter>maxTime+timeEpsilon) return null;
        double time=max(0,min(maxTime,enter));
        Shape aa=a.translate(av.scale(time)),bb=b.translate(bv.scale(time));
        Vec2 normal=axisAtEntry==null?bb.center().sub(aa.center()).unit():axisAtEntry;
        if (bb.center().sub(aa.center()).dot(normal)<0) normal=normal.scale(-1);
        Manifold m=geometry.sat(aa,bb);
        if (m==null) m=new Manifold(normal,0,List.of(aa.center().add(bb.center()).scale(0.5)),a.id(),b.id(),a.material(),b.material());
        return new Impact(time,List.of(m));
    }
    List<Pair> candidates(Motion a,Motion b,double time) {
        List<Pair> pairs=new ArrayList<>();
        Bounds[] first=new Bounds[a.shapes.size()],second=new Bounds[b.shapes.size()];
        for(int i=0;i<first.length;i++)first[i]=motionBounds(a.shapes.get(i),a,time);
        for(int j=0;j<second.length;j++)second[j]=motionBounds(b.shapes.get(j),b,time);
        for(int i=0;i<first.length;i++)for(int j=0;j<second.length;j++)if(first[i].intersects(second[j],epsilon))pairs.add(new Pair(a.shapes.get(i),b.shapes.get(j)));
        pairs.sort(Comparator.comparing((Pair p)->p.first.id()).thenComparing(p->p.second.id()));
        return pairs;
    }
    List<Manifold> manifoldsAt(Motion a,Motion b,List<Pair> pairs,double time) {
        List<Manifold> found=new ArrayList<>();
        Map<Shape,Shape> first=new IdentityHashMap<>(),second=new IdentityHashMap<>();
        for (Pair pair:pairs) {
            Shape aa=first.computeIfAbsent(pair.first,s->at(s,a,time)),bb=second.computeIfAbsent(pair.second,s->at(s,b,time));
            Manifold m=geometry.sat(aa,bb); if(m!=null) found.add(m);
        }
        return geometry.consolidate(found);
    }
    boolean mayOverlapGap(Motion a,Motion b,Pair pair,double start,double duration) {
        Shape aa=at(pair.first,a,start),bb=at(pair.second,b,start);
        return motionBounds(aa,new Motion(List.of(aa),a.position.add(a.velocity.scale(start)),a.velocity,a.yaw),duration)
                .intersects(motionBounds(bb,new Motion(List.of(bb),b.position.add(b.velocity.scale(start)),b.velocity,b.yaw),duration),epsilon);
    }
    Impact refine(Motion a,Motion b,List<Pair> pairs,double clear,double occupied,List<Manifold> found) {
        for (int i=0;i<(int)contract.number("collision","ccdTimeRefinementIterations");i++) {
            double middle=(clear+occupied)/2; List<Manifold> m=manifoldsAt(a,b,pairs,middle);
            if (m.isEmpty()) clear=middle; else { occupied=middle; found=m; }
        }
        return new Impact(occupied,found);
    }
    public Impact sweep(Motion a,Motion b,double maxTime) {
        if (maxTime<0) throw new IllegalArgumentException("Negative CCD interval");
        double arc=(abs(a.yaw)*radius(a)+abs(b.yaw)*radius(b))*maxTime;
        List<Pair> pairs=candidates(a,b,maxTime);
        if (arc<=epsilon) {
            List<Impact> impacts=new ArrayList<>(); Impact earliest=null;
            for (Pair pair:pairs) {
                Impact hit=linear(pair.first,a.velocity,pair.second,b.velocity,maxTime); if(hit==null) continue;
                impacts.add(hit);
                if (earliest==null || hit.time<earliest.time-timeEpsilon || (abs(hit.time-earliest.time)<=timeEpsilon
                        && (hit.manifolds.getFirst().firstId()+":"+hit.manifolds.getFirst().secondId()).compareTo(earliest.manifolds.getFirst().firstId()+":"+earliest.manifolds.getFirst().secondId())<0)) earliest=hit;
            }
            if(earliest==null) return null;
            double time=earliest.time;
            return new Impact(time,geometry.consolidate(impacts.stream().filter(i->abs(i.time-time)<=timeEpsilon).flatMap(i->i.manifolds.stream()).toList()));
        }
        if (pairs.isEmpty()) return null;
        List<Manifold> initial=manifoldsAt(a,b,pairs,0); if(!initial.isEmpty()) return new Impact(0,initial);
        double maxArc=contract.number("collision","ccdMaximumAngularArcStepMeters");
        int intervals=max(1,(int)ceil(arc/maxArc));
        int subdivisions=max(1,(int)ceil((arc/intervals)/(maxArc/contract.number("collision","ccdAngularPoseSamplesPerMaximumArcStep"))));
        double clear=0;
        for(int interval=1;interval<=intervals;interval++) {
            double end=maxTime*interval/intervals,duration=end-clear;
            TreeSet<Double> probes=new TreeSet<>();
            for(Pair pair:pairs) {
                Impact hit=linear(at(pair.first,a,clear),a.velocity,at(pair.second,b,clear),b.velocity,duration);
                if(hit!=null && hit.time>timeEpsilon && hit.time<duration-timeEpsilon) probes.add(clear+hit.time);
            }
            for(int sample=1;sample<=subdivisions;sample++) probes.add(clear+duration*sample/subdivisions);
            double previous=clear,lastOriginal=Double.NEGATIVE_INFINITY;
            for(double probe:probes) {
                boolean duplicate=probe-lastOriginal<=timeEpsilon; lastOriginal=probe; if(duplicate) continue;
                double gap=probe-previous; boolean possible=false;
                if(gap>timeEpsilon) for(Pair pair:pairs) if(mayOverlapGap(a,b,pair,previous,gap)) { possible=true; break; }
                if(possible) {
                    double mid=previous+gap/2; List<Manifold> found=manifoldsAt(a,b,pairs,mid);
                    if(!found.isEmpty()) return refine(a,b,pairs,previous,mid,found);
                }
                List<Manifold> found=manifoldsAt(a,b,pairs,probe);
                if(!found.isEmpty()) return refine(a,b,pairs,previous,probe,found);
                previous=probe;
            }
            clear=end;
        }
        return null;
    }
}
