package com.neverlift.backend.room;

import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/** Two headless client scripts over real HTTP + WebSocket/Tomcat, no UI and no client physics. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties="app.version=module-3b-test")
class AuthoritativeRaceIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired RoomWebSocketHandler handler;
    final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    JsonNode request(String path,String token,Object body) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://localhost:"+port+path)).timeout(Duration.ofSeconds(10)).header("Content-Type","application/json");
        if(token!=null)builder.header("Authorization","Bearer "+token);
        var response=http.send(builder.POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as("%s: %s",path,response.body()).isBetween(200,299);return mapper.readTree(response.body());
    }
    String register(String name) throws Exception {
        return request("/api/auth/register",null,Map.of("gamertag",name+UUID.randomUUID(),"displayName",name,"password","p@ss")).path("token").asText();
    }
    @Test void twoClientsReceiveIdenticalTrajectoryAndCollisionsAndRejectVersionMismatch() throws Exception {
        String host=register("physics-host"),other=register("physics-driver");String code=request("/api/rooms",host,Map.of("gridSize",2,"trackId","monaco")).path("code").asText();
        request("/api/rooms/"+code+"/join",other,Map.of());
        try(Client a=connect(host,code,"2.0.3");Client b=connect(other,code,"2.0.3")) {
            await(()->a.messages.stream().anyMatch(m->m.path("type").asText().equals("room_state")) && b.messages.stream().anyMatch(m->m.path("type").asText().equals("room_state")),5);
            request("/api/rooms/"+code+"/ready",other,Map.of("ready",true));
            JsonNode room=request("/api/rooms/"+code+"/start",host,Map.of());
            String hostId=room.path("hostId").asText();List<String> ids=new ArrayList<>();room.path("players").forEach(p->ids.add(p.path("id").asText()));Collections.sort(ids);
            double hostSteer=hostId.equals(ids.getFirst())?1:-1;
            for(int sequence=0;sequence<180;sequence++) {
                // Refresh intention at 30 Hz. Deliberately converge toward the other car, then barriers.
                a.send("input",Map.of("throttle",1,"brake",0,"steer",hostSteer,"clientSeq",sequence,"clientTimestamp",sequence*33));
                b.send("input",Map.of("throttle",1,"brake",0,"steer",-hostSteer,"clientSeq",sequence,"clientTimestamp",sequence*33));
                Thread.sleep(33);
            }
            await(()->a.snapshots.size()>=30 && b.snapshots.size()>=30,5);
            Set<Long> common=new TreeSet<>(a.snapshots.keySet());common.retainAll(b.snapshots.keySet());
            assertThat(common.size()).isGreaterThan(30);
            for(long tick:common) assertThat(a.snapshots.get(tick)).as("same authoritative tick %s",tick).isEqualTo(b.snapshots.get(tick));
            assertThat(a.snapshots.values().stream().flatMap(s->java.util.stream.StreamSupport.stream(s.path("cars").spliterator(),false)))
                    .anyMatch(car->car.path("speed").doubleValue()>1);
            // Light contacts must not be mistaken for mandatory damage: 2.0.2 intentionally ignores low delta-v.
            assertThat(handler.resolvedContacts(code)).as("real authoritative contacts occurred while both clients received the same trajectories").isPositive();
            JsonNode last=a.snapshots.get(Collections.max(a.snapshots.keySet()));
            assertThat(last.path("trackId").asText()).isEqualTo("monaco");assertThat(last.path("physicsContractVersion").asText()).isEqualTo("2.0.3");
            a.send("input",Map.of("throttle",1,"brake",0,"steer",0,"clientSeq",999,"clientTimestamp",0,"x",99999));
            await(()->a.messages.stream().anyMatch(m->m.path("type").asText().equals("error")&&m.path("payload").path("code").asText().equals("invalid_message")),5);
            // Only read snapshots after the last valid command has expired; the applied control ramps down.
            Thread.sleep(600);JsonNode stopped=a.snapshots.get(Collections.max(a.snapshots.keySet()));
            assertThat(stopped.path("cars")).allSatisfy(car->assertThat(car.path("physicsState").path("appliedThrottle").doubleValue()).isZero());
            b.send("input",Map.of("physicsContractVersion","obsolete"));
            await(()->b.closeCode!=null,5);assertThat(b.closeCode).isEqualTo(1008);
            assertThat(b.messages).anyMatch(m->m.path("type").asText().equals("race_event") && m.path("payload").path("type").asText().equals("version_mismatch"));
            System.out.println("M3B TWO-CLIENT PROOF: "+common.size()+" identical snapshots; trajectory and collision observed; version mismatch closed");
        } finally {request("/api/rooms/"+code+"/leave",host,Map.of());request("/api/rooms/"+code+"/leave",other,Map.of());}
    }
    Client connect(String token,String code,String version) throws Exception {
        String ticket=request("/api/rooms/"+code+"/connection-ticket",token,Map.of()).path("ticket").asText();
        Client client=new Client();client.socket=http.newWebSocketBuilder().buildAsync(URI.create("ws://localhost:"+port+"/ws?ticket="+ticket),client).get(5,TimeUnit.SECONDS);
        client.send("join_room",Map.of("roomCode",code,"trackCatalogVersion","2026.12","physicsContractVersion",version));return client;
    }
    static void await(java.util.function.BooleanSupplier condition,int seconds) throws Exception {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(seconds);while(!condition.getAsBoolean() && System.nanoTime()<deadline)Thread.sleep(10);assertThat(condition.getAsBoolean()).isTrue();
    }
    final class Client implements WebSocket.Listener,AutoCloseable {
        WebSocket socket;volatile Integer closeCode;final List<JsonNode> messages=new CopyOnWriteArrayList<>();final Map<Long,JsonNode> snapshots=new ConcurrentHashMap<>();final StringBuilder fragment=new StringBuilder();
        public void onOpen(WebSocket webSocket){webSocket.request(1);}
        public CompletionStage<?> onText(WebSocket webSocket,CharSequence data,boolean last){
            fragment.append(data);if(last)try{JsonNode message=mapper.readTree(fragment.toString());messages.add(message);if(message.path("type").asText().equals("state_snapshot")){JsonNode p=message.path("payload");snapshots.put(p.path("tick").longValue(),p);}fragment.setLength(0);}catch(Exception error){throw new RuntimeException(error);}
            webSocket.request(1);return null;
        }
        public CompletionStage<?> onClose(WebSocket webSocket,int status,String reason){closeCode=status;return null;}
        void send(String type,Object payload)throws Exception{socket.sendText(mapper.writeValueAsString(Map.of("type",type,"payload",payload)),true).get(5,TimeUnit.SECONDS);}
        public void close(){if(socket!=null)socket.abort();}
    }
}
