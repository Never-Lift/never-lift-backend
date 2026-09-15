package com.neverlift.backend.race.online;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.*;
import com.neverlift.backend.race.physics.*;

/** Synthetic circular track used only by tests. Never changes the production catalog. */
public final class ShortTrack {
    public static final double RADIUS=80, LENGTH=2*Math.PI*RADIUS;
    public static Vec2 point(double distance){double a=distance/RADIUS;return new Vec2(RADIUS*PortableMath.cos(a),RADIUS*PortableMath.sin(a));}
    public static JsonNode definition() {
        ObjectNode track=PhysicsContract.resource("tracks/monaco.json").deepCopy();
        track.put("lengthMeters",LENGTH);
        ArrayNode center=track.putArray("centerline"),line=track.putArray("racingLine");
        for(int i=0;i<=160;i++) {
            double d=LENGTH*i/160;Vec2 p=point(d);
            ObjectNode node=center.addObject().put("x",p.x()).put("y",p.y()).put("distanceMeters",d).put("halfWidthMeters",14).put("elevationLayer",0).put("targetSpeedFactor",0.6);
            line.add(node.deepCopy());
        }
        ArrayNode checkpoints=track.putArray("checkpoints");
        for(int i=1;i<4;i++)gate(checkpoints.addObject(),i-1,LENGTH*i/4);
        gate(track.putObject("startFinish"),0,0);
        ArrayNode grid=track.putArray("gridSlots");
        for(int i=0;i<22;i++) {
            double d=-8-i*16,a=d/RADIUS;Vec2 p=point(d).scale(1+(i%2==0?-3:3)/RADIUS);
            ObjectNode slot=grid.addObject().put("angle",a+Math.PI/2);
            slot.putObject("position").put("x",p.x()).put("y",p.y());
        }
        track.putArray("curbs");
        ObjectNode segment=track.putObject("trackLimits").putArray("segments").addObject().put("fromDistanceMeters",0).put("toDistanceMeters",LENGTH);
        for(String side:new String[]{"left","right"})segment.putObject(side).putArray("zones").addObject().put("widthMeters",200).put("surface","grass");
        ArrayNode barriers=track.putObject("barrierGeometry").putArray("segments");
        ObjectNode barrier=barriers.addObject().put("index",0).put("material","concrete-wall").put("side","right").put("thicknessMeters",1);
        barrier.putArray("chunkIndexes").add(0);
        ArrayNode path=barrier.putArray("path");
        path.addObject().put("x",-1000).put("y",-1000).put("distanceMeters",0).put("elevationLayer",0);
        path.addObject().put("x",1000).put("y",-1000).put("distanceMeters",LENGTH).put("elevationLayer",0);
        ObjectNode chunk=track.putArray("chunks").addObject().put("index",0).put("fromDistanceMeters",0).put("toDistanceMeters",LENGTH);
        chunk.putObject("bounds").put("minX",-1100).put("minY",-1100).put("maxX",1100).put("maxY",1100);
        ObjectNode pit=track.putObject("pitLane");pit.putArray("path");pit.putObject("garageBarrier").putArray("path");
        track.putObject("sceneryLayout").putArray("escapeRoads");
        return track;
    }
    private static void gate(ObjectNode gate,int index,double d) {
        Vec2 p=point(d);double a=d/RADIUS;
        gate.put("index",index).put("distanceMeters",d).put("halfWidthMeters",14);
        gate.putObject("position").put("x",p.x()).put("y",p.y());
        gate.putObject("forward").put("x",-PortableMath.sin(a)).put("y",PortableMath.cos(a));
    }
}
