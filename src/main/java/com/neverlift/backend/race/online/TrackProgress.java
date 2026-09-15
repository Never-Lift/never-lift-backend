package com.neverlift.backend.race.online;

import com.fasterxml.jackson.databind.JsonNode;
import com.neverlift.backend.race.physics.*;
import java.util.*;

/** Ordered directional gates. Invalid travel never banks distance or checkpoint credit. */
public final class TrackProgress {
    public record Gate(Vec2 position, Vec2 forward, double halfWidth, double distance) {
        static Gate read(JsonNode n) {
            return new Gate(vector(n.path("position")),vector(n.path("forward")),
                    n.path("halfWidthMeters").asDouble(),n.path("distanceMeters").asDouble());
        }
        private static Vec2 vector(JsonNode n) { return new Vec2(n.path("x").asDouble(),n.path("y").asDouble()); }
        public double crossing(Vec2 from, Vec2 to, double margin) {
            double a=from.sub(position).dot(forward), b=to.sub(position).dot(forward);
            if(a>=0 || b<0 || b<=a)return Double.NaN;
            double fraction=-a/(b-a);
            Vec2 at=from.add(to.sub(from).scale(fraction));
            return Math.abs(at.sub(position).dot(forward.left()))<=halfWidth+margin?fraction:Double.NaN;
        }
    }
    public record Crossing(boolean checkpoint, boolean finish, boolean validLap, double fraction) {
        static final Crossing NONE=new Crossing(false,false,false,0);
    }
    private final TrackGeometry track;
    private final List<Gate> checkpoints;
    private final Gate finish;
    private final double margin;
    private int nextCheckpoint, laps;
    private boolean started, invalidLap;
    private Double previousDistance;
    private double validProgress;
    private Double returnDistance;

    public TrackProgress(TrackGeometry track, JsonNode definition, PhysicsContract contract) {
        this.track=track;
        List<Gate> gates=new ArrayList<>();
        for(JsonNode gate:definition.path("checkpoints"))gates.add(Gate.read(gate));
        checkpoints=List.copyOf(gates); finish=Gate.read(definition.path("startFinish"));
        margin=contract.number("race","checkpointGateMarginMeters");
    }
    public Crossing advance(Vec2 from, Vec2 to) {
        var a=track.project(from,previousDistance);
        var b=track.project(to,a.distance());previousDistance=b.distance();
        boolean within=a.offset()<=a.halfWidth()+margin && b.offset()<=b.halfWidth()+margin;
        double delta=track.wrap(b.distance()-a.distance()+track.length/2)-track.length/2;
        if(!within) {
            invalidLap=true;
            if(returnDistance==null)returnDistance=a.distance();
            return Crossing.NONE;
        }
        if(returnDistance!=null) {
            double gap=track.wrap(b.distance()-returnDistance+track.length/2)-track.length/2;
            if(Math.abs(gap)>margin+to.sub(from).length())return Crossing.NONE;
            returnDistance=null;
        }
        if(delta<0)return Crossing.NONE;
        double crossing=finish.crossing(from,to,margin);
        if(!Double.isNaN(crossing)) {
            boolean valid=started && nextCheckpoint==checkpoints.size() && !invalidLap;
            if(valid)laps++;
            started=true;nextCheckpoint=0;invalidLap=false;
            validProgress=laps*track.length;
            return new Crossing(false,true,valid,crossing);
        }
        boolean checkpoint=false;
        if(started && nextCheckpoint<checkpoints.size()) {
            double hit=checkpoints.get(nextCheckpoint).crossing(from,to,margin);
            if(!Double.isNaN(hit)){nextCheckpoint++;checkpoint=true;}
        }
        if(started) {
            double ceiling=nextCheckpoint<checkpoints.size()?checkpoints.get(nextCheckpoint).distance():track.length;
            validProgress=Math.max(validProgress,laps*track.length+Math.min(b.distance(),ceiling));
        }
        return new Crossing(checkpoint,false,false,0);
    }
    public int laps(){return laps;}
    public int nextCheckpoint(){return nextCheckpoint;}
    public double validProgress(){return validProgress;}
    public boolean invalidLap(){return invalidLap;}
}
