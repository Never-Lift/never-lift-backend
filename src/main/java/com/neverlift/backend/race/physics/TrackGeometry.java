package com.neverlift.backend.race.physics;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import static java.lang.Math.*;
import static com.neverlift.backend.race.physics.CollisionGeometry.*;
import static com.neverlift.backend.race.physics.PhysicsContract.requiredNumber;

/** Metric v2 geometry. Published faces, not a second approximation of track walls. */
public final class TrackGeometry {
    public record Point(Vec2 position, double distance, double halfWidth, int layer, double speedFactor) {}
    public record Projection(Vec2 point, double distance, double offset, double halfWidth, int layer, double preference) {}
    public record Spawn(Vec2 position, double angle) {}
    private record Barrier(Shape shape, Bounds bounds, int layer, Set<Integer> chunks) {}
    private record Cell(int x, int y) {}
    private final JsonNode definition;
    private final PhysicsContract contract;
    private final List<Point> centerline, racingLine;
    private final Map<Integer, Bounds> chunks = new TreeMap<>();
    private final Map<Cell, List<Barrier>> cells = new HashMap<>();
    private final List<Barrier> allBarriers = new ArrayList<>();
    private final double cellSize, epsilon;
    public final String id, catalogVersion, physicsVersion;
    public final double length;

    public TrackGeometry(PhysicsContract contract, JsonNode definition) {
        this.contract = contract; this.definition = definition.deepCopy();
        id = definition.path("id").asText(); catalogVersion = definition.path("catalogVersion").asText();
        physicsVersion = definition.path("physicsContractVersion").asText();
        if (!contract.version().equals(physicsVersion)) throw new IllegalArgumentException("Incompatible track physics version");
        length = requiredNumber(definition, "lengthMeters");
        centerline = points(definition.path("centerline")); racingLine = points(definition.path("racingLine"));
        if (centerline.size() < 2 || racingLine.size() < 2) throw new IllegalArgumentException("Empty track paths");
        cellSize = contract.number("race", "barrierBroadphaseCellMeters"); epsilon = contract.number("collision", "geometryEpsilon");
        for (JsonNode chunk : definition.path("chunks")) {
            JsonNode b = chunk.path("bounds");
            chunks.put(chunk.path("index").intValue(), new Bounds(n(b,"minX"), n(b,"minY"), n(b,"maxX"), n(b,"maxY")));
        }
        for (JsonNode barrier : definition.path("barrierGeometry").path("segments")) buildBarrier(barrier, false);
        buildBarrier(definition.path("pitLane").path("garageBarrier"), true);
        // Current published catalog has no physical escape-road obstacles. Never silently omit future ones.
        for (JsonNode road : definition.path("sceneryLayout").path("escapeRoads")) {
            if (road.path("affectsPhysics").asBoolean()) throw new IllegalArgumentException("Unsupported physical escape road: " + id);
        }
        if (allBarriers.isEmpty()) throw new IllegalArgumentException("Missing canonical barriers");
        for (Barrier barrier : allBarriers) {
            for (int index : barrier.chunks) chunks.computeIfPresent(index, (ignored,b) -> b.union(barrier.bounds));
            for (int x=cell(barrier.bounds.minX()); x<=cell(barrier.bounds.maxX()); x++)
                for (int y=cell(barrier.bounds.minY()); y<=cell(barrier.bounds.maxY()); y++)
                    cells.computeIfAbsent(new Cell(x,y), ignored -> new ArrayList<>()).add(barrier);
        }
    }
    private static double n(JsonNode node,String key) { return requiredNumber(node,key); }
    private static Vec2 vector(JsonNode node) { return new Vec2(n(node,"x"),n(node,"y")); }
    private static List<Point> points(JsonNode path) {
        List<Point> result=new ArrayList<>();
        for (JsonNode p:path) result.add(new Point(vector(p),n(p,"distanceMeters"),p.path("halfWidthMeters").doubleValue(),p.path("elevationLayer").intValue(),p.path("targetSpeedFactor").doubleValue()));
        return List.copyOf(result);
    }
    private int cell(double coordinate) { return (int)floor(coordinate/cellSize); }
    private void buildBarrier(JsonNode barrier, boolean garage) {
        JsonNode path=barrier.path("path");
        for (int i=0;i<path.size()-1;i++) {
            JsonNode from=path.get(i),to=path.get(i+1); Vec2 a=vector(from),b=vector(to);
            Vec2 inward=b.sub(a).left().unit().scale(barrier.path("side").asText().equals("left")?-1:1);
            if (inward.equals(Vec2.ZERO)) continue;
            Vec2 outward=inward.scale(-n(barrier,"thicknessMeters"));
            String shapeId=garage?"garage-barrier-"+i:"barrier-"+barrier.path("index").intValue()+"-"+i;
            Shape shape=new Shape(shapeId,barrier.path("material").asText(),List.of(a,a.add(outward),b.add(outward),b));
            Set<Integer> indexes=new TreeSet<>();
            for (JsonNode chunk:definition.path("chunks")) if (garage || n(chunk,"toDistanceMeters")>=n(from,"distanceMeters") && n(chunk,"fromDistanceMeters")<=n(to,"distanceMeters")) indexes.add(chunk.path("index").intValue());
            if(indexes.isEmpty()) for(JsonNode index:barrier.path("chunkIndexes")) indexes.add(index.intValue());
            allBarriers.add(new Barrier(shape,bounds(shape),garage?0:from.path("elevationLayer").intValue(),Set.copyOf(indexes)));
        }
    }
    public List<Shape> barriers(int layer, Bounds bounds) {
        if(bounds==null) return allBarriers.stream().filter(b->b.layer==layer).map(Barrier::shape).sorted(Comparator.comparing(Shape::id)).toList();
        Set<Integer> allowed=new HashSet<>(); chunks.forEach((index,b)->{if(b.intersects(bounds,0)) allowed.add(index);});
        Map<String,Shape> found=new TreeMap<>();
        for(int x=cell(bounds.minX());x<=cell(bounds.maxX());x++) for(int y=cell(bounds.minY());y<=cell(bounds.maxY());y++)
            for(Barrier b:cells.getOrDefault(new Cell(x,y),List.of())) if(b.layer==layer && b.bounds.intersects(bounds,epsilon) && !Collections.disjoint(allowed,b.chunks)) found.put(b.shape.id(),b.shape);
        return List.copyOf(found.values());
    }
    public double wrap(double distance) { return ((distance%length)+length)%length; }
    private double circular(double a,double b) { double difference=abs(wrap(a)-wrap(b));return min(difference,length-difference); }
    private static double lerp(double a,double b,double alpha) { return a+(b-a)*alpha; }
    private static double alpha(Vec2 p,Vec2 from,Vec2 to) {
        Vec2 direction=to.sub(from);double square=direction.dot(direction);
        return square<=ulp(1.0)?0:VehicleIntegrator.clamp(p.sub(from).dot(direction)/square,0,1);
    }
    private Projection project(Vec2 p,Double preferred,boolean local) {
        Projection best=null;double window=min(contract.number("race","localProjectionWindowMeters"),length/2);
        double tolerance=contract.number("race","projectionDistanceToleranceMeters");
        int[] indexes=local?localIndexes(preferred,window):java.util.stream.IntStream.range(0,centerline.size()-1).toArray();
        for(int i:indexes) {
            Point a=centerline.get(i),b=centerline.get(i+1);
            double t=alpha(p,a.position,b.position);Vec2 at=a.position.add(b.position.sub(a.position).scale(t));
            double distance=lerp(a.distance,b.distance,t),preference=preferred==null?0:circular(distance,preferred);
            if(local && preference>window) continue;
            Projection candidate=new Projection(at,distance,p.sub(at).length(),lerp(a.halfWidth,b.halfWidth,t),t<0.5?a.layer:b.layer,preference);
            if(best==null || candidate.offset<best.offset-tolerance || abs(candidate.offset-best.offset)<=tolerance && candidate.preference<best.preference) best=candidate;
        }
        return best;
    }
    private int[] localIndexes(double preferred,double window) {
        double normalized=wrap(preferred),from=normalized-window,to=normalized+window;
        List<double[]> ranges=new ArrayList<>();if(from<0)ranges.add(new double[]{length+from,length});if(to>length)ranges.add(new double[]{0,to-length});ranges.add(new double[]{max(0,from),min(length,to)});
        Set<Integer> indexes=new TreeSet<>();
        for(double[] range:ranges) {
            int start=max(0,upper(centerline,range[0])-1);
            for(int i=start;i<centerline.size()-1 && centerline.get(i).distance<=range[1];i++)if(centerline.get(i+1).distance>=range[0])indexes.add(i);
        }
        return indexes.stream().mapToInt(Integer::intValue).toArray();
    }
    public Projection project(Vec2 p,Double preferred) {
        if(preferred!=null) {
            Projection local=project(p,preferred,true);
            if(local!=null) {
                JsonNode segment=limit(local.distance);
                double width=max(zoneWidth(segment.path("left")),zoneWidth(segment.path("right")));
                if(local.offset<=local.halfWidth+width+contract.number("race","localProjectionRecoveryMarginMeters")) return local;
            }
        }
        return Objects.requireNonNull(project(p,preferred,false));
    }
    private static double zoneWidth(JsonNode environment) { double sum=0;for(JsonNode zone:environment.path("zones")) sum+=n(zone,"widthMeters");return sum; }
    private JsonNode limit(double distance) {
        double d=wrap(distance);JsonNode segments=definition.path("trackLimits").path("segments");
        for(JsonNode segment:segments) if(d>=n(segment,"fromDistanceMeters") && d<n(segment,"toDistanceMeters")) return segment;
        return segments.get(segments.size()-1);
    }
    private int upper(List<Point> path,double distance) {
        int low=0,high=path.size()-1;while(low<high){int middle=(low+high)/2;if(path.get(middle).distance<distance)low=middle+1;else high=middle;}return max(1,low);
    }
    private Point point(List<Point> path,double distance) {
        double d=wrap(distance);int index=upper(path,d);Point a=path.get(index-1),b=path.get(index);
        double t=VehicleIntegrator.clamp((d-a.distance)/max(ulp(1.0),b.distance-a.distance),0,1);
        return new Point(a.position.add(b.position.sub(a.position).scale(t)),d,lerp(a.halfWidth,b.halfWidth,t),t<0.5?a.layer:b.layer,lerp(a.speedFactor,b.speedFactor,t));
    }
    public Point racingPoint(double distance) { return point(racingLine,distance); }
    public Point centerPoint(double distance) { return point(centerline,distance); }
    public Vec2 tangent(double distance) { int i=upper(centerline,wrap(distance));return centerline.get(i).position.sub(centerline.get(i-1).position).unit(); }
    public String surface(Vec2 position,Double preferred) {
        JsonNode pit=definition.path("pitLane").path("path");
        for(int i=0;i<pit.size()-1;i++) {
            Vec2 a=vector(pit.get(i)),b=vector(pit.get(i+1));
            if(position.sub(a.add(b.sub(a).scale(alpha(position,a,b)))).length()<=contract.number("race","pitLaneHalfWidthMeters")) return definition.path("surfaceModel").path("pitLane").asText();
        }
        Projection p=project(position,preferred);String side=tangent(p.distance).cross(position.sub(p.point))>=0?"left":"right";
        for(JsonNode curb:definition.path("curbs")) if(curb.path("side").asText().equals(side) && p.distance>=n(curb,"fromDistanceMeters") && p.distance<=n(curb,"toDistanceMeters") && p.offset>=p.halfWidth && p.offset<=p.halfWidth+n(curb,"widthMeters")) return "curb";
        String material=definition.path("surfaceModel").path("onTrack").asText();double beyond=max(0,p.offset-p.halfWidth),end=0;
        if(beyond>0) for(JsonNode zone:limit(p.distance).path(side).path("zones")) { end+=n(zone,"widthMeters");material=zone.path("surface").asText();if(beyond<=end)break; }
        return material;
    }
    /** Physics-only staging positions; qualification/pit-release rules remain Part 3c. */
    public Spawn spawn(int index) {
        JsonNode slots=definition.path("gridSlots");
        if(index<slots.size()) return new Spawn(vector(slots.get(index).path("position")),n(slots.get(index),"angle"));
        // Extend the published two-column grid: gap is contracted; lateral offset is measured from its first row.
        double lateral=vector(slots.get(0).path("position")).sub(vector(slots.get(1).path("position"))).length()/2;
        double distance=length-(index/2+1)*contract.number("race","gridGapMeters");
        Vec2 tangent=tangent(distance);Vec2 at=centerPoint(distance).position.add(tangent.left().scale(index%2==0?-lateral:lateral));
        return new Spawn(at,StrictMath.atan2(tangent.y(),tangent.x()));
    }
}
