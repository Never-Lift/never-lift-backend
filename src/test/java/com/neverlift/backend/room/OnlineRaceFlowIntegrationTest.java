package com.neverlift.backend.room;

import com.fasterxml.jackson.databind.*;
import com.neverlift.backend.race.*;
import com.neverlift.backend.race.online.*;
import com.neverlift.backend.race.physics.*;
import com.neverlift.backend.room.dto.RoomResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/** Two authenticated client scripts, real Tomcat/WebSocket, real 120 Hz physics and a migrated database. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties={"app.version=module-3c-test","spring.datasource.url=jdbc:h2:mem:online_flow;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE"})
@Import(OnlineRaceFlowIntegrationTest.TrackFixture.class)
class OnlineRaceFlowIntegrationTest {
    @TestConfiguration static class TrackFixture {
        @Bean @Primary OnlineRaceSessionFactory shortTrackFactory() {
            return new OnlineRaceSessionFactory() {
                @Override public OnlineRaceSession create(RoomResponse room) {
                    return new OnlineRaceSession(new PhysicsContract(),ShortTrack.definition(),
                            room.players().stream().map(p->new OnlineRaceSession.Participant(p.id().toString(),p.userId(),p.displayName(),p.color(),p.bot())).toList(),
                            room.settings().laps(),"normal",System.currentTimeMillis());
                }
            };
        }
    }
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired RaceResultRepository repository;
    @Autowired RoomManager roomManager;
    final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    final PhysicsContract physics=new PhysicsContract();
    final TrackGeometry geometry=new TrackGeometry(physics,ShortTrack.definition());
    final BotPlanner planner=new BotPlanner(physics);
    JsonNode request(String method,String path,String token,Object body)throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://localhost:"+port+path)).timeout(Duration.ofSeconds(10)).header("Content-Type","application/json");
        if(token!=null)builder.header("Authorization","Bearer "+token);
        var response=http.send(builder.method(method,HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as("%s %s",path,response.body()).isBetween(200,299);return mapper.readTree(response.body());
    }
    String register(String name)throws Exception{return request("POST","/api/auth/register",null,Map.of("gamertag",name+UUID.randomUUID(),"displayName",name,"password","pass")).path("token").asText();}
    @Test void twoScriptsCompleteTwoLapsFromQualifyingThroughPersistedRaceResult()throws Exception {
        String host=register("flow-host"),other=register("flow-other");
        String code=request("POST","/api/rooms",host,Map.of("trackId","monaco","gridSize",2)).path("code").asText();
        request("PATCH","/api/rooms/"+code+"/settings",host,Map.of("laps",2));
        request("POST","/api/rooms/"+code+"/join",other,Map.of());
        long initial=repository.count();
        try(Client a=connect(host,code);Client b=connect(other,code)) {
            waitFor(()->a.joined&&b.joined,5);
            request("POST","/api/rooms/"+code+"/ready",other,Map.of("ready",true));
            request("POST","/api/rooms/"+code+"/start",host,Map.of());
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(180);boolean ready=false,reconnected=false;
            while(System.nanoTime()<deadline && (a.result==null || b.result==null)) {
                if(!ready && a.phase().equals("qualifying_results") && b.phase().equals("qualifying_results")) {
                    assertThat(repository.count()).isEqualTo(initial);
                    assertThat(a.latest.path("cars")).allSatisfy(car->assertThat(car.path("qualifyingAttempts").asInt()).isEqualTo(2));
                    b.qualifyingResult=null;b.reconnect();
                    waitFor(()->b.qualifyingResult!=null,5);
                    request("POST","/api/rooms/"+code+"/ready",host,Map.of("ready",true));
                    Thread.sleep(100);
                    assertThat(a.phase()).isEqualTo("qualifying_results");
                    request("POST","/api/rooms/"+code+"/ready",other,Map.of("ready",true));ready=true;
                }
                if(!reconnected && b.phase().equals("race") && b.latest.path("raceTimeMs").asLong()>5000) {
                    String sameCar=b.id;long beforeTick=b.latest.path("tick").asLong();b.reconnect();
                    waitFor(()->b.latest.path("tick").asLong()>beforeTick,5);
                    assertThat(b.id).isEqualTo(sameCar);reconnected=true;
                }
                a.drive();b.drive();Thread.sleep(33);
            }
            assertThat(a.result).as("First client result; last=%s errors=%s",a.latest,a.errors).isNotNull();
            assertThat(b.result).isEqualTo(a.result);
            assertThat(reconnected).isTrue();
            assertThat(a.result.path("standings")).hasSize(2).allSatisfy(s->{
                assertThat(s.path("finished").asBoolean()).isTrue();assertThat(s.path("laps").asInt()).isEqualTo(2);
                assertThat(s.path("totalTimeMs").asLong()).isPositive();assertThat(s.path("bestLapTimeMs").asLong()).isPositive();
            });
            assertThat(a.result.path("standings").get(0).path("totalTimeMs").asLong()).isLessThanOrEqualTo(a.result.path("standings").get(1).path("totalTimeMs").asLong());
            assertThat(a.lightStages).containsExactly(1,2,3,4,5);assertThat(b.lightStages).isEqualTo(a.lightStages);
            var stored=repository.findAll().stream().filter(r->r.getMode()==RaceMode.ONLINE).toList();
            assertThat(stored).hasSize(2).allMatch(r->r.isFinished()&&r.getUserId()!=null);
            assertThat(stored).extracting(RaceResult::getPosition).containsExactlyInAnyOrder(1,2);
            for(var row:stored) {
                var wire=a.result.path("standings").get(row.getPosition()-1);
                assertThat(row.getTotalTimeMs()).isEqualTo(wire.path("totalTimeMs").asLong());
                assertThat(row.getUserId().toString()).isEqualTo(wire.path("userId").asText());
            }
            assertThat(a.errors).isEmpty();assertThat(b.errors).isEmpty();
            var common=new HashSet<>(a.raceSnapshots.keySet());common.retainAll(b.raceSnapshots.keySet());
            assertThat(common.size()).isGreaterThan(20);
            for(long tick:common)assertThat(a.raceSnapshots.get(tick)).isEqualTo(b.raceSnapshots.get(tick));
            JsonNode result=a.result;b.result=null;b.reconnect();waitFor(()->b.result!=null,5);assertThat(b.result).isEqualTo(result);
            System.out.println("M3C END-TO-END PROOF: two authenticated WebSocket scripts, 2 qualifying laps, five lights, two race laps; "+a.result+"; persisted="+stored.size());
            request("POST","/api/rooms/"+code+"/ready",host,Map.of("ready",true));
            request("POST","/api/rooms/"+code+"/ready",other,Map.of("ready",true));
            waitFor(()->a.roomState.equals("lobby")&&b.roomState.equals("lobby"),5);
        } finally {request("POST","/api/rooms/"+code+"/leave",host,Map.of());request("POST","/api/rooms/"+code+"/leave",other,Map.of());}
    }
    Client connect(String token,String code)throws Exception {
        String ticket=request("POST","/api/rooms/"+code+"/connection-ticket",token,Map.of()).path("ticket").asText();
        Client c=new Client();c.ticket=ticket;c.code=code;c.socket=http.newWebSocketBuilder().buildAsync(URI.create("ws://localhost:"+port+"/ws?ticket="+ticket),c).get(5,TimeUnit.SECONDS);
        c.send("join_room",Map.of("roomCode",code,"trackCatalogVersion","2026.12","physicsContractVersion","2.0.3"));return c;
    }
    static void waitFor(java.util.function.BooleanSupplier condition,int seconds)throws Exception {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(seconds);
        while(!condition.getAsBoolean()&&System.nanoTime()<deadline)Thread.sleep(10);
        assertThat(condition.getAsBoolean()).isTrue();
    }
    final class Client implements WebSocket.Listener,AutoCloseable {
        WebSocket socket;volatile boolean joined;volatile JsonNode latest,result,qualifyingResult;volatile String roomState="";
        String ticket,code;
        final Map<Long,JsonNode> raceSnapshots=new ConcurrentHashMap<>();
        final List<String> errors=new CopyOnWriteArrayList<>();final List<Integer> lightStages=new CopyOnWriteArrayList<>();
        final StringBuilder fragment=new StringBuilder();long sequence;String id;
        public void onOpen(WebSocket socket){socket.request(1);}
        public CompletionStage<?> onText(WebSocket socket,CharSequence data,boolean last) {
            fragment.append(data);
            if(last)try {
                var message=mapper.readTree(fragment.toString());var p=message.path("payload");fragment.setLength(0);
                switch(message.path("type").asText()) {
                    case "room_state" -> {joined=true;roomState=p.path("state").asText();}
                    case "state_snapshot" -> {latest=p;if(id==null&&p.path("cars").size()==1)id=p.path("cars").get(0).path("playerId").asText();if(p.path("phase").asText().equals("race"))raceSnapshots.put(p.path("tick").asLong(),p);}
                    case "race_result" -> result=p;
                    case "error" -> errors.add(p.toString());
                    case "race_event" -> {if(p.path("type").asText().equals("start_light"))lightStages.add(p.path("stage").asInt());if(p.path("type").asText().equals("qualifying_result"))qualifyingResult=p;}
                }
            }catch(Exception error){errors.add(error.toString());}
            socket.request(1);return null;
        }
        String phase(){return latest==null?"":latest.path("phase").asText();}
        void reconnect()throws Exception {
            socket.abort();joined=false;
            waitFor(()->roomManager.get(code).players().stream().anyMatch(p->p.id().toString().equals(id)&&!p.connected()),5);
            Thread.sleep(200);
            socket=http.newWebSocketBuilder().buildAsync(URI.create("ws://localhost:"+port+"/ws?ticket="+ticket),this).get(5,TimeUnit.SECONDS);
            send("join_room",Map.of("roomCode",code,"trackCatalogVersion","2026.12","physicsContractVersion","2.0.3"));
            waitFor(()->joined,5);
        }
        void drive()throws Exception {
            JsonNode snapshot=latest;if(snapshot==null||id==null)return;
            DriverInput input=DriverInput.NEUTRAL;
            if(phase().equals("qualifying")||phase().equals("race")) {
                JsonNode car=null;for(JsonNode candidate:snapshot.path("cars"))if(candidate.path("playerId").asText().equals(id))car=candidate;
                if(car==null)return;
                VehicleState pose=new VehicleState(id,physics);pose.x=car.path("x").asDouble();pose.y=car.path("y").asDouble();pose.angle=car.path("angle").asDouble();
                pose.velocityX=car.path("velocityX").asDouble();pose.velocityY=car.path("velocityY").asDouble();
                pose.surface=geometry.surface(new Vec2(pose.x,pose.y),car.path("trackDistanceMeters").asDouble());
                input=planner.plan(pose,geometry,car.path("trackDistanceMeters").asDouble(),snapshot.path("physicsSubstep").asLong()/120.0,"normal");
            }
            send("input",Map.of("throttle",input.throttle(),"brake",input.brake(),"steer",input.steer(),"clientSeq",sequence++,"clientTimestamp",System.currentTimeMillis()));
        }
        void send(String type,Object payload)throws Exception {socket.sendText(mapper.writeValueAsString(Map.of("type",type,"payload",payload)),true).get(5,TimeUnit.SECONDS);}
        public void close(){if(socket!=null)socket.abort();}
    }
}
