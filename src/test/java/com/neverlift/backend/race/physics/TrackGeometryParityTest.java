package com.neverlift.backend.race.physics;

import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import java.util.stream.*;
import static org.assertj.core.api.Assertions.*;
import static com.neverlift.backend.race.physics.CollisionGeometry.*;

class TrackGeometryParityTest {
    final PhysicsContract c=new PhysicsContract();
    @TestFactory Stream<DynamicTest> allPublishedCircuitsAndBotDecisionsMatchTypeScript() throws Exception {
        JsonNode reference=new ObjectMapper().readTree(getClass().getResourceAsStream("/physics/typescript-geometry-2.0.3.json"));
        assertThat(reference.path("tracks")).hasSize(24);
        return StreamSupport.stream(reference.path("tracks").spliterator(),false).map(t->DynamicTest.dynamicTest(t.path("id").asText(),()->{
            TrackGeometry geometry=new TrackGeometry(c,PhysicsContract.resource("tracks/"+t.path("id").asText()+".json"));
            BotPlanner planner=new BotPlanner(c);
            for(JsonNode s:t.path("samples")) {
                Vec2 point=v(s.path("position"));double distance=s.path("distance").doubleValue();var projection=geometry.project(point,distance);JsonNode p=s.path("projection");
                near(projection.point().x(),p.path("point").path("x").doubleValue());near(projection.point().y(),p.path("point").path("y").doubleValue());
                near(projection.distance(),p.path("distanceMeters").doubleValue());near(projection.offset(),p.path("distanceFromCenterMeters").doubleValue());
                near(projection.halfWidth(),p.path("halfWidthMeters").doubleValue());assertThat(projection.layer()).isEqualTo(p.path("elevationLayer").intValue());
                assertThat(geometry.surface(point,distance)).isEqualTo(s.path("surface").asText());
                var b=s.path("bounds");var barriers=geometry.barriers(projection.layer(),new Bounds(b.path("minX").doubleValue(),b.path("minY").doubleValue(),b.path("maxX").doubleValue(),b.path("maxY").doubleValue()));
                assertThat(barriers).hasSize(s.path("barriers").size());
                for(int i=0;i<barriers.size();i++) {
                    Shape actual=barriers.get(i);JsonNode expected=s.path("barriers").get(i);
                    assertThat(actual.id()).isEqualTo(expected.path("id").asText());assertThat(actual.material()).isEqualTo(expected.path("collisionMaterial").asText());
                    for(int j=0;j<actual.vertices().size();j++){near(actual.vertices().get(j).x(),v(expected.path("vertices").get(j)).x());near(actual.vertices().get(j).y(),v(expected.path("vertices").get(j)).y());}
                }
                VehicleState car=new VehicleState("bot-reference",c);car.x=point.x();car.y=point.y();car.angle=s.path("angle").doubleValue();car.velocityX=v(s.path("velocity")).x();car.velocityY=v(s.path("velocity")).y();car.surface=s.path("surface").asText();
                for(String difficulty:java.util.List.of("easy","normal","hard")) {
                    DriverInput actual=planner.plan(car,geometry,distance,2,difficulty);JsonNode expected=s.path("inputs").path(difficulty);
                    near(actual.throttle(),expected.path("throttle").doubleValue());near(actual.brake(),expected.path("brake").doubleValue());near(actual.steer(),expected.path("steer").doubleValue());
                }
            }
        }));
    }
    static Vec2 v(JsonNode n){return new Vec2(n.path("x").doubleValue(),n.path("y").doubleValue());}
    static void near(double a,double b){assertThat(a).isCloseTo(b,within(1e-9));}
}
