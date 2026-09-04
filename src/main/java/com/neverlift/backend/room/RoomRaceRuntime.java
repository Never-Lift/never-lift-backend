package com.neverlift.backend.room;

import com.neverlift.backend.race.physics.*;
import com.neverlift.backend.room.dto.RoomResponse;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;

/** Dedicated simulation clock plus independent 20 Hz publication; socket I/O cannot block physics. */
final class RoomRaceRuntime implements AutoCloseable {
    static final long SNAPSHOT_PERIOD_MILLIS=50;
    private final ScheduledExecutorService simulation,publication;
    private final RaceEngine engine;
    private final String trackId,catalogVersion,physicsVersion;
    private volatile RaceEngine.Snapshot latest;
    private volatile long resolvedContacts;
    private volatile boolean closed;
    RoomRaceRuntime(RoomResponse room, Consumer<RaceEngine.Snapshot> publish, Consumer<Throwable> failed) {
        PhysicsContract c=new PhysicsContract();TrackGeometry track=new TrackGeometry(c,PhysicsContract.resource("tracks/"+room.trackId()+".json"));
        trackId=track.id;catalogVersion=track.catalogVersion;physicsVersion=track.physicsVersion;
        requireVersions(room);
        var ordered=room.players().stream().sorted(Comparator.comparing(p->p.id().toString())).toList();
        List<RaceEngine.Entrant> entrants=new ArrayList<>();
        for(int i=0;i<ordered.size();i++) { var p=ordered.get(i);entrants.add(new RaceEngine.Entrant(p.id().toString(),p.bot(),room.settings().botDifficulty(),track.spawn(i))); }
        engine=new RaceEngine(c,track,entrants);latest=engine.snapshot(System.currentTimeMillis());
        simulation=executor("never-lift-physics-"+room.code());publication=executor("never-lift-snapshot-"+room.code());
        // Fixed dt, never elapsed wall time. Rounding the scheduling period does not change integration.
        simulation.scheduleAtFixedRate(()->{
            if(closed)return;
            try { engine.tick(System.nanoTime());latest=engine.snapshot(System.currentTimeMillis());resolvedContacts=engine.resolvedContacts(); }
            catch(Throwable error){ close();failed.accept(error); }
        },0,Math.round(c.number("simulation","serverTickSeconds")*TimeUnit.SECONDS.toNanos(1)),TimeUnit.NANOSECONDS);
        publication.scheduleAtFixedRate(()->{if(!closed)try{publish.accept(latest);}catch(RuntimeException error){close();failed.accept(error);}},SNAPSHOT_PERIOD_MILLIS,SNAPSHOT_PERIOD_MILLIS,TimeUnit.MILLISECONDS);
    }
    private static ScheduledExecutorService executor(String name) {
        return Executors.newSingleThreadScheduledExecutor(task->{Thread t=new Thread(task,name);t.setDaemon(true);return t;});
    }
    void requireVersions(RoomResponse room) {
        if(!trackId.equals(room.trackId())||!catalogVersion.equals(room.trackCatalogVersion())||!physicsVersion.equals(room.physicsContractVersion()))throw new IllegalStateException("Pinned race versions changed");
    }
    boolean input(UUID id,DriverInput input,long sequence){return !closed && engine.acceptInput(id.toString(),input,sequence,System.nanoTime());}
    void clearInput(UUID id){engine.clearInput(id.toString());}
    void retain(RoomResponse room){requireVersions(room);engine.retainParticipants(room.players().stream().map(p->p.id().toString()).collect(java.util.stream.Collectors.toSet()));}
    boolean isClosed(){return closed;}
    long resolvedContacts(){return resolvedContacts;}
    @Override public void close(){closed=true;simulation.shutdownNow();publication.shutdownNow();}
}
