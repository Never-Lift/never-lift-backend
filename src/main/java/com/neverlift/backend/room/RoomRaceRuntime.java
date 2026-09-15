package com.neverlift.backend.room;

import com.neverlift.backend.race.physics.*;
import com.neverlift.backend.race.online.*;
import com.neverlift.backend.room.dto.RoomResponse;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;

/** Single simulation owner and independent publication. Socket/database I/O never holds the simulation lock. */
final class RoomRaceRuntime implements AutoCloseable {
    static final long SNAPSHOT_PERIOD_MILLIS=50;
    record Publication(OnlineRaceSession.Snapshot snapshot,List<OnlineRaceSession.Event> events,boolean driving) {}
    private final ScheduledExecutorService simulation,publication;
    private final OnlineRaceSession session;
    private final String trackId,catalogVersion,physicsVersion;
    private final Set<String> originalPlayers;
    private final Object lock=new Object();
    private final List<OnlineRaceSession.Event> pending=new ArrayList<>();
    private OnlineRaceSession.Snapshot latest;
    private volatile RoomResponse membership;
    private volatile long resolvedContacts;
    private volatile boolean closed;

    RoomRaceRuntime(RoomResponse room, OnlineRaceSessionFactory factory, Consumer<Publication> publish, Consumer<Throwable> failed) {
        trackId=room.trackId();catalogVersion=room.trackCatalogVersion();physicsVersion=room.physicsContractVersion();
        membership=room;originalPlayers=room.players().stream().map(p->p.id().toString()).collect(java.util.stream.Collectors.toUnmodifiableSet());
        session=factory.create(room);latest=session.snapshot();pending.addAll(session.drainEvents());
        simulation=executor("never-lift-physics-"+room.code());publication=executor("never-lift-snapshot-"+room.code());
        simulation.scheduleAtFixedRate(()->{
            if(closed)return;
            try {
                synchronized(lock) {
                    if(closed)return;
                    updateMembership();
                    session.tick(System.nanoTime());latest=session.snapshot();resolvedContacts=session.resolvedContacts();
                    pending.addAll(session.drainEvents());
                    if(pending.size()>1024)throw new IllegalStateException("Race publication backlog exceeded");
                }
            } catch(Throwable error){close();failed.accept(error);}
        },33_333_333,33_333_333,TimeUnit.NANOSECONDS);
        publication.scheduleAtFixedRate(()->{
            if(closed)return;
            try {
                Publication frame;
                synchronized(lock){frame=new Publication(latest,List.copyOf(pending),session.startedDriving());pending.clear();}
                publish.accept(frame);
            }catch(RuntimeException error){close();failed.accept(error);}
        },SNAPSHOT_PERIOD_MILLIS,SNAPSHOT_PERIOD_MILLIS,TimeUnit.MILLISECONDS);
    }
    private void updateMembership() {
        RoomResponse room=membership;
        Map<String,Boolean> connected=new HashMap<>();
        room.players().forEach(p->connected.put(p.id().toString(),p.connected()));
        for(String id:originalPlayers) {
            if(!connected.containsKey(id))session.leave(id);
            else session.connected(id,connected.get(id));
        }
        if(session.phase()==OnlineRaceSession.Phase.QUALIFYING_RESULTS && room.state().equals("qualifying_results")
                && room.players().stream().filter(p->!p.bot() && p.connected()).allMatch(p->Boolean.TRUE.equals(room.readyStates().get(p.id()))))session.startRace();
        if(session.phase()==OnlineRaceSession.Phase.RESULTS && room.state().equals("results")
                && room.players().stream().filter(p->!p.bot() && p.connected()).allMatch(p->Boolean.TRUE.equals(room.readyStates().get(p.id()))))session.acknowledgeResults();
    }
    private static ScheduledExecutorService executor(String name) {
        return Executors.newSingleThreadScheduledExecutor(task->{Thread t=new Thread(task,name);t.setDaemon(true);return t;});
    }
    void requireVersions(RoomResponse room) {
        if(!trackId.equals(room.trackId())||!catalogVersion.equals(room.trackCatalogVersion())||!physicsVersion.equals(room.physicsContractVersion()))throw new IllegalStateException("Pinned race versions changed");
    }
    boolean input(UUID id,DriverInput input,long sequence) {
        synchronized(lock) {
            if(closed)return false;
            // Handshake membership may arrive between ticks. Accept the first resumed
            // command now; the changed controller is observed by physics on its next tick.
            boolean connected=membership.players().stream().anyMatch(p->p.id().equals(id)&&p.connected());
            if(!connected)return false;
            session.connected(id.toString(),true);
            return session.input(id.toString(),input,sequence,System.nanoTime());
        }
    }
    void clearInput(UUID id){synchronized(lock){session.connected(id.toString(),false);}}
    void retain(RoomResponse room){requireVersions(room);membership=room;}
    boolean isClosed(){return closed;}
    boolean owns(UUID sessionId){synchronized(lock){return latest.sessionId().equals(sessionId);}}
    RoomResponse cancelQualification(RoomManager manager,UUID userId,String code) {
        synchronized(lock) {
            if(session.startedDriving())manager.markDrivingStarted(code);
            RoomResponse response=manager.cancelQualification(userId,code);
            close();return response;
        }
    }
    long resolvedContacts(){return resolvedContacts;}
    @Override public void close(){closed=true;simulation.shutdownNow();publication.shutdownNow();}
}
