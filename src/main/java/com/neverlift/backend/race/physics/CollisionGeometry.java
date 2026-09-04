package com.neverlift.backend.race.physics;

import java.util.*;
import java.util.stream.Stream;
import static java.lang.Math.*;

/** Convex SAT plus deterministic consolidation of overlapping compound shapes. */
public final class CollisionGeometry {
    public static final class Shape {
        private final String id, material;
        private final List<Vec2> vertices;
        private final Bounds bounds;
        private final Vec2 center;
        private List<Vec2> cachedAxes;
        private double cachedAxesEpsilon;
        public Shape(String id,String material,List<Vec2> vertices) {
            this.id=id;this.material=material;this.vertices=List.copyOf(vertices);
            if(vertices.size()<3)throw new IllegalArgumentException("Convex collider needs three vertices");
            double minX=Double.POSITIVE_INFINITY,minY=minX,maxX=Double.NEGATIVE_INFINITY,maxY=maxX,sx=0,sy=0;
            for(Vec2 v:vertices){minX=min(minX,v.x());minY=min(minY,v.y());maxX=max(maxX,v.x());maxY=max(maxY,v.y());sx+=v.x();sy+=v.y();}
            bounds=new Bounds(minX,minY,maxX,maxY);center=new Vec2(sx*(1.0/vertices.size()),sy*(1.0/vertices.size()));
        }
        public String id(){return id;}
        public String material(){return material;}
        public List<Vec2> vertices(){return vertices;}
        public Vec2 center(){return center;}
        public Shape transform(Vec2 origin,double angle){return pose(Vec2.ZERO,origin,angle);}
        public Shape pose(Vec2 from,Vec2 to,double angle){
            double cosine=PortableMath.cos(angle),sine=PortableMath.sin(angle);List<Vec2> result=new ArrayList<>(vertices.size());
            for(Vec2 v:vertices){double x=v.x()-from.x(),y=v.y()-from.y();result.add(new Vec2(to.x()+(x*cosine-y*sine),to.y()+(x*sine+y*cosine)));}
            return new Shape(id,material,result);
        }
        public Shape translate(Vec2 offset){List<Vec2> result=new ArrayList<>(vertices.size());for(Vec2 v:vertices)result.add(v.add(offset));return new Shape(id,material,result);}
    }
    public record Bounds(double minX, double minY, double maxX, double maxY) {
        public boolean intersects(Bounds b, double epsilon) { return !(maxX < b.minX - epsilon || minX > b.maxX + epsilon || maxY < b.minY - epsilon || minY > b.maxY + epsilon); }
        public Bounds union(Bounds b) { return new Bounds(min(minX, b.minX), min(minY, b.minY), max(maxX, b.maxX), max(maxY, b.maxY)); }
        public Bounds expand(double n) { return new Bounds(minX - n, minY - n, maxX + n, maxY + n); }
    }
    public record Manifold(Vec2 normal, double penetration, List<Vec2> contacts, String firstId, String secondId, String firstMaterial, String secondMaterial) {
        public Manifold { contacts = List.copyOf(contacts); }
        public Manifold withContacts(List<Vec2> points) { return new Manifold(normal, penetration, points, firstId, secondId, firstMaterial, secondMaterial); }
    }
    public static final Comparator<Manifold> ORDER = Comparator.comparing(Manifold::firstId).thenComparing(Manifold::secondId);
    public final double epsilon, mergeDistance, normalMergeCosine;
    final int maxContacts;
    public final List<Shape> vehicleShapes;
    public CollisionGeometry(PhysicsContract c) {
        epsilon = c.number("collision", "geometryEpsilon"); mergeDistance = c.number("collision", "contactMergeDistanceMeters");
        normalMergeCosine = c.number("collision", "manifoldNormalMergeCosine"); maxContacts = (int)c.number("collision", "maximumContactPoints");
        List<Shape> shapes = new ArrayList<>();
        for (var shape : PhysicsContract.resource("vehicle-definition.json").path("collisionShapes")) {
            List<Vec2> points = new ArrayList<>();
            for (var point : shape.path("vertices")) points.add(new Vec2(point.path("x").doubleValue(), point.path("y").doubleValue()));
            shapes.add(new Shape(shape.path("id").asText(), null, points));
        }
        vehicleShapes = List.copyOf(shapes);
    }
    public List<Shape> vehicle(Vec2 position, double angle) { List<Shape> result=new ArrayList<>(vehicleShapes.size());for(Shape s:vehicleShapes)result.add(s.transform(position,angle));return result; }
    public static Vec2 centroid(List<Vec2> points) {
        Vec2 sum = Vec2.ZERO; for (Vec2 point : points) sum = sum.add(point); return sum.scale(1.0 / points.size());
    }
    public static Bounds bounds(Shape s) {
        return s.bounds;
    }
    List<Vec2> axes(Shape s) {
        if(s.cachedAxes==null || s.cachedAxesEpsilon!=epsilon){s.cachedAxes=axes(s.vertices);s.cachedAxesEpsilon=epsilon;}
        return s.cachedAxes;
    }
    List<Vec2> axes(List<Vec2> points) {
        List<Vec2> result = new ArrayList<>();
        for (int i = 0; i < points.size(); i++) {
            Vec2 edge = points.get((i + 1) % points.size()).sub(points.get(i));
            if (edge.length() <= epsilon) continue;
            Vec2 axis = edge.left().unit();
            boolean duplicate=false;for(Vec2 v:result)if(abs(v.dot(axis))>=1-epsilon){duplicate=true;break;}
            if(!duplicate)result.add(axis);
        }
        return result;
    }
    double[] project(List<Vec2> points, Vec2 axis) {
        double low = points.getFirst().dot(axis), high = low;
        for (Vec2 p : points) { low = min(low, p.dot(axis)); high = max(high, p.dot(axis)); }
        return new double[]{low, high};
    }
    boolean contains(Vec2 p, List<Vec2> polygon) {
        double sign = 0;
        for (int i = 0; i < polygon.size(); i++) {
            Vec2 a = polygon.get(i), b = polygon.get((i+1) % polygon.size());
            double turn = b.sub(a).cross(p.sub(a)); if (abs(turn) <= epsilon) continue;
            if (sign != 0 && signum(turn) != sign) return false;
            sign = signum(turn);
        }
        return true;
    }
    Vec2 intersection(Vec2 a, Vec2 b, Vec2 c, Vec2 d) {
        Vec2 ab = b.sub(a), cd = d.sub(c); double denominator = ab.cross(cd);
        if (abs(denominator) <= epsilon) return null;
        double first = c.sub(a).cross(cd) / denominator, second = c.sub(a).cross(ab) / denominator;
        if (first < -epsilon || first > 1+epsilon || second < -epsilon || second > 1+epsilon) return null;
        return a.add(ab.scale(VehicleIntegrator.clamp(first, 0, 1)));
    }
    List<Vec2> unique(List<Vec2> points) {
        List<Vec2> result = new ArrayList<>();
        for(Vec2 point:points){boolean duplicate=false;for(Vec2 v:result)if(v.distanceSquared(point)<=mergeDistance*mergeDistance){duplicate=true;break;}if(!duplicate)result.add(point);}
        return result;
    }
    List<Vec2> reduce(List<Vec2> points, Vec2 normal) {
        List<Vec2> unique = unique(points); if (unique.size() <= maxContacts) return unique;
        Vec2 tangent = normal.left(); unique.sort(Comparator.comparingDouble((Vec2 v) -> v.dot(tangent)).thenComparingDouble(Vec2::x).thenComparingDouble(Vec2::y));
        List<Vec2> result = new ArrayList<>();
        for (int i=0; i<maxContacts; i++) result.add(unique.get(maxContacts == 1 ? 0 : (int)floor((double)i*(unique.size()-1)/(maxContacts-1)+0.5)));
        return result;
    }
    Vec2 support(List<Vec2> polygon, Vec2 direction) {
        Vec2 best = polygon.getFirst(); for (Vec2 p : polygon) if (p.dot(direction) > best.dot(direction)) best=p; return best;
    }
    List<Vec2> contacts(Shape a, Shape b, Vec2 normal) {
        List<Vec2> points = new ArrayList<>();
        for (Vec2 p : a.vertices) if (contains(p,b.vertices)) points.add(p);
        for (Vec2 p : b.vertices) if (contains(p,a.vertices)) points.add(p);
        for (int i=0; i<a.vertices.size(); i++) for (int j=0; j<b.vertices.size(); j++) {
            Vec2 point = intersection(a.vertices.get(i),a.vertices.get((i+1)%a.vertices.size()),b.vertices.get(j),b.vertices.get((j+1)%b.vertices.size()));
            if (point != null) points.add(point);
        }
        if (points.isEmpty()) return List.of(support(a.vertices,normal).add(support(b.vertices,normal.scale(-1))).scale(0.5));
        return reduce(points,normal);
    }
    public Manifold sat(Shape a, Shape b) {
        double overlap = Double.POSITIVE_INFINITY; Vec2 best = null;
        List<Vec2> firstAxes=axes(a),secondAxes=axes(b);
        for(int index=0;index<firstAxes.size()+secondAxes.size();index++) {
            Vec2 axis=index<firstAxes.size()?firstAxes.get(index):secondAxes.get(index-firstAxes.size());
            double[] pa=project(a.vertices,axis), pb=project(b.vertices,axis);
            double depth=min(pa[1],pb[1])-max(pa[0],pb[0]); if (depth < -epsilon) return null;
            if (depth < overlap) { overlap=max(0,depth); best=axis; }
        }
        if (best==null) return null;
        Vec2 normal = b.center().sub(a.center()).dot(best)<0 ? best.scale(-1):best;
        return new Manifold(normal,overlap,contacts(a,b,normal),a.id,b.id,a.material,b.material);
    }
    public boolean shareContact(Manifold a, Manifold b) {
        for(Vec2 p:a.contacts)for(Vec2 q:b.contacts)if(p.distanceSquared(q)<=mergeDistance*mergeDistance)return true;return false;
    }
    public List<Manifold> consolidate(List<Manifold> manifolds) {
        List<List<Manifold>> clusters = new ArrayList<>();
        for (Manifold m : manifolds.stream().sorted(ORDER).toList()) {
            List<Manifold> cluster = clusters.stream().filter(c -> c.getFirst().normal.dot(m.normal)>=normalMergeCosine
                    && Objects.equals(c.getFirst().secondMaterial,m.secondMaterial) && c.stream().anyMatch(p->shareContact(p,m))).findFirst().orElse(null);
            if (cluster==null) { cluster=new ArrayList<>(); clusters.add(cluster); } cluster.add(m);
        }
        return clusters.stream().map(this::representative).sorted(ORDER).toList();
    }
    Manifold representative(List<Manifold> cluster) {
        Manifold best=cluster.getFirst();
        for (Manifold m : cluster) if (m.penetration>best.penetration+epsilon) best=m;
        return best.withContacts(reduce(cluster.stream().flatMap(m->m.contacts.stream()).toList(),best.normal));
    }
    public List<Manifold> compound(List<Shape> a, List<Shape> b) {
        List<Manifold> contacts=new ArrayList<>();
        for (Shape x:a) for (Shape y:b) {
            if (!bounds(x).intersects(bounds(y),epsilon)) continue;
            Manifold m=sat(x,y); if (m!=null) contacts.add(m);
        }
        return consolidate(contacts);
    }
}
