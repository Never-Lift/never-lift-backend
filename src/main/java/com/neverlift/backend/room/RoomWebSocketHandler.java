package com.neverlift.backend.room;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PongMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

import com.neverlift.backend.error.ApiException;
import com.neverlift.backend.room.dto.RoomResponse;
import com.neverlift.backend.room.dto.RoomStatePayload;
import com.neverlift.backend.race.physics.DriverInput;
import com.neverlift.backend.race.physics.RaceEngine;

/** Ticket-authenticated lobby and Part 3b authoritative input/snapshot transport. */
@Component
public class RoomWebSocketHandler extends AbstractWebSocketHandler implements DisposableBean {

    public static final String TICKET_ATTRIBUTE = "connectionTicket";
    public static final String USER_ID_ATTRIBUTE = "userId";
    public static final String ROOM_CODE_ATTRIBUTE = "roomCode";
    private static final int MAX_MISSED_HEARTBEATS = 3;

    private final RoomManager roomManager;
    private final ObjectMapper objectMapper;
    private final Map<String, Connection> connections = new ConcurrentHashMap<>();
    private final Map<String, RoomRaceRuntime> races = new ConcurrentHashMap<>();
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(RoomWebSocketHandler.class);
    private final ScheduledExecutorService heartbeatExecutor = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "never-lift-room-heartbeat");
        thread.setDaemon(true);
        return thread;
    });

    public RoomWebSocketHandler(RoomManager roomManager, ObjectMapper objectMapper) {
        this.roomManager = roomManager;
        this.objectMapper = objectMapper;
        heartbeatExecutor.scheduleAtFixedRate(this::runHeartbeatCycle, 10, 10, TimeUnit.SECONDS);
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        ConnectionTicket ticket = (ConnectionTicket) session.getAttributes().get(TICKET_ATTRIBUTE);
        if (ticket == null) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("A connection ticket is required"));
            return;
        }
        UUID userId = ticket.getUserId();
        connections.put(session.getId(), new Connection(session, userId, ticket.getRoomCode()));
        session.getAttributes().put(USER_ID_ATTRIBUTE, userId);
        session.getAttributes().put(ROOM_CODE_ATTRIBUTE, ticket.getRoomCode());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        Connection connection = connections.get(session.getId());
        if (connection == null) {
            return;
        }
        try {
            JsonNode envelope = objectMapper.readTree(message.getPayload());
            String type = envelope.path("type").asText("");
            JsonNode payload = envelope.path("payload");
            switch (type) {
                case "join_room" -> joinRoom(session, connection, payload);
                case "select_loadout" -> {
                    requireJoined(connection);
                    roomManager.setLoadoutColor(connection.userId, connection.roomCode,
                            payload.path("color").asText(null));
                    broadcastRoomState(connection.roomCode);
                }
                case "ready" -> {
                    requireJoined(connection);
                    boolean ready = !payload.has("ready") || payload.path("ready").asBoolean();
                    roomManager.setReady(connection.userId, connection.roomCode, ready);
                    broadcastRoomState(connection.roomCode);
                }
                case "start_race" -> {
                    requireJoined(connection);
                    roomManager.start(connection.userId, connection.roomCode);
                    broadcastRoomState(connection.roomCode);
                }
                case "input" -> receiveInput(session, connection, payload);
                case "ping" -> sendEnvelope(session, "pong", Map.of());
                default -> sendError(session, "unsupported_message", "Message type is not supported in the lobby");
            }
        } catch (ApiException exception) {
            sendError(session, exception.getCode(), exception.getMessage());
        } catch (Exception exception) {
            sendError(session, "invalid_message", "Message payload is invalid");
        }
    }

    private void joinRoom(WebSocketSession session, Connection connection, JsonNode payload) throws IOException {
        String roomCode = payload.path("roomCode").asText(null);
        String trackCatalogVersion = payload.path("trackCatalogVersion").asText(null);
        String physicsContractVersion = payload.path("physicsContractVersion").asText(null);
        if (!connection.roomCode.equals(roomCode)) {
            sendError(session, "incompatible_protocol", "Room protocol version is not supported");
            return;
        }
        RoomResponse room = roomManager.get(roomCode);
        if (!room.trackCatalogVersion().equals(trackCatalogVersion)
                || !room.physicsContractVersion().equals(physicsContractVersion)) {
            rejectVersion(session, connection, room);
            return;
        }
        connection.joined = true;
        broadcastRoomState(connection.roomCode);
    }

    private void rejectVersion(WebSocketSession session, Connection connection, RoomResponse room) throws IOException {
        sendEnvelope(session, "race_event", Map.of("type", "version_mismatch", "trackId", room.trackId(),
                "trackCatalogVersion", room.trackCatalogVersion(), "physicsContractVersion", room.physicsContractVersion()));
        connection.joined = false;
        RoomRaceRuntime race = races.get(connection.roomCode);
        if (race != null) race.clearInput(connection.userId);
        session.close(CloseStatus.POLICY_VIOLATION.withReason("version_mismatch"));
    }

    private void receiveInput(WebSocketSession session, Connection connection, JsonNode payload) throws IOException {
        requireJoined(connection);
        RoomResponse room = roomManager.get(connection.roomCode);
        if ((payload.has("physicsContractVersion") && !room.physicsContractVersion().equals(payload.path("physicsContractVersion").asText()))
                || (payload.has("trackCatalogVersion") && !room.trackCatalogVersion().equals(payload.path("trackCatalogVersion").asText()))) {
            rejectVersion(session, connection, room); return;
        }
        // Reject state injection rather than accepting it as an alternative source of truth.
        java.util.Set<String> allowed = java.util.Set.of("throttle", "brake", "steer", "clientSeq", "clientTimestamp");
        var names = payload.fieldNames();
        while (names.hasNext()) if (!allowed.contains(names.next())) throw new IllegalArgumentException("Unexpected input field");
        for (String name : java.util.List.of("throttle", "brake", "steer", "clientTimestamp"))
            if (!payload.path(name).isNumber() || !Double.isFinite(payload.path(name).doubleValue())) throw new IllegalArgumentException("Invalid input number");
        if (!payload.path("clientSeq").isIntegralNumber() || !payload.path("clientSeq").canConvertToLong()
                || payload.path("clientSeq").longValue() < 0 || payload.path("clientTimestamp").doubleValue() < 0) throw new IllegalArgumentException("Invalid input sequence");
        RoomRaceRuntime race = races.get(connection.roomCode);
        if (race == null || race.isClosed()) { sendError(session, "race_not_active", "The physics session is not active"); return; }
        DriverInput input = new DriverInput(payload.path("throttle").doubleValue(), payload.path("brake").doubleValue(), payload.path("steer").doubleValue());
        if (!race.input(connection.userId, input, payload.path("clientSeq").longValue())) sendError(session, "participant_not_found", "Input is not accepted for this participant");
    }

    private void sendRoomState(WebSocketSession session, String roomCode) throws IOException {
        sendEnvelope(session, "room_state", RoomStatePayload.from(roomManager.get(roomCode)));
    }

    public void broadcastRoomState(String roomCode) {
        RoomResponse state = roomManager.get(roomCode);
        synchronizeRace(state);
        connections.values().stream()
                .filter(connection -> roomCode.equals(connection.roomCode))
                .forEach(connection -> sendEnvelopeQuietly(connection.session, "room_state", RoomStatePayload.from(state)));
    }

    private void synchronizeRace(RoomResponse room) {
        boolean hasHumans = room.players().stream().anyMatch(player -> !player.bot());
        if ((!room.state().equals("qualifying") && !room.state().equals("race")) || !hasHumans) {
            stopRace(room.code()); return;
        }
        RoomRaceRuntime runtime = races.computeIfAbsent(room.code(), ignored -> new RoomRaceRuntime(room,
                snapshot -> broadcastSnapshot(room.code(), snapshot), error -> {
                    LOG.error("Authoritative physics stopped for room {}", room.code(), error);
                    connections.values().stream().filter(c -> room.code().equals(c.roomCode) && c.joined)
                            .forEach(c -> sendEnvelopeQuietly(c.session, "error", Map.of("code", "physics_failed", "message", "A sessão física foi interrompida. Nenhum resultado foi registrado.")));
                }));
        runtime.retain(room);
    }

    private void broadcastSnapshot(String roomCode, RaceEngine.Snapshot snapshot) {
        connections.values().stream().filter(c -> c.joined && roomCode.equals(c.roomCode))
                .sorted(java.util.Comparator.comparing(c -> c.session.getId()))
                .forEach(c -> sendEnvelopeQuietly(c.session, "state_snapshot", snapshot));
    }

    void stopRace(String roomCode) {
        RoomRaceRuntime race = races.remove(roomCode);
        if (race != null) race.close();
    }
    long resolvedContacts(String roomCode) {
        RoomRaceRuntime race=races.get(roomCode);return race==null?0:race.resolvedContacts();
    }

    public void disconnectParticipant(String roomCode, UUID userId, String code, String message) {
        RoomRaceRuntime race = races.get(roomCode);
        if (race != null) race.clearInput(userId);
        connections.entrySet().removeIf(entry -> {
            Connection connection = entry.getValue();
            if (!roomCode.equals(connection.roomCode) || !userId.equals(connection.userId)) {
                return false;
            }
            sendEnvelopeQuietly(connection.session, "error", Map.of("code", code, "message", message));
            closeQuietly(connection.session, CloseStatus.POLICY_VIOLATION.withReason(code));
            return true;
        });
    }

    public void closeRoom(String roomCode, String code, String message) {
        stopRace(roomCode);
        connections.entrySet().removeIf(entry -> {
            Connection connection = entry.getValue();
            if (!roomCode.equals(connection.roomCode)) {
                return false;
            }
            sendEnvelopeQuietly(connection.session, "error", Map.of("code", code, "message", message));
            closeQuietly(connection.session, CloseStatus.NORMAL.withReason(code));
            return true;
        });
    }

    private void sendEnvelope(WebSocketSession session, String type, Object payload) throws IOException {
        Map<String, Object> envelope = Map.of("type", type, "payload", payload);
        synchronized (session) {
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(envelope)));
        }
    }

    private void sendEnvelopeQuietly(WebSocketSession session, String type, Object payload) {
        try {
            if (session.isOpen()) {
                sendEnvelope(session, type, payload);
            }
        } catch (IOException ignored) {
            // A closing client is handled by the transport callback.
        }
    }

    private void sendError(WebSocketSession session, String code, String message) throws IOException {
        sendEnvelope(session, "error", Map.of("code", code, "message", message));
    }

    private void closeQuietly(WebSocketSession session, CloseStatus status) {
        try {
            if (session.isOpen()) {
                session.close(status);
            }
        } catch (IOException ignored) {
            // The connection has already been removed from the authoritative map.
        }
    }

    private void requireJoined(Connection connection) {
        if (!connection.joined) {
            throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST,
                    "join_required", "Join the room before changing lobby state");
        }
    }

    /** Sends protocol pings every 10 seconds and closes after three misses. */
    void runHeartbeatCycle() {
        Instant now = Instant.now();
        connections.values().forEach(connection -> {
            if (!connection.session.isOpen()) {
                return;
            }
            boolean missed = connection.lastPong != null
                    && Duration.between(connection.lastPong, now).compareTo(Duration.ofSeconds(10)) > 0;
            try {
                synchronized (connection.session) {
                    connection.session.sendMessage(new org.springframework.web.socket.PingMessage());
                }
            } catch (IOException exception) {
                missed = true;
            }
            if (missed) {
                connection.missedHeartbeats++;
            }
            if (connection.missedHeartbeats >= MAX_MISSED_HEARTBEATS) {
                connections.remove(connection.session.getId(), connection);
                roomManager.markDisconnected(connection.userId, connection.roomCode);
                broadcastRoomState(connection.roomCode);
                scheduleDisconnectedRemoval(connection);
                closeQuietly(connection.session, CloseStatus.SESSION_NOT_RELIABLE);
            }
        });
    }

    @Override
    protected void handlePongMessage(WebSocketSession session, PongMessage message) {
        Connection connection = connections.get(session.getId());
        if (connection != null) {
            connection.lastPong = Instant.now();
            connection.missedHeartbeats = 0;
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        markDisconnected(session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        markDisconnected(session);
    }

    private void markDisconnected(WebSocketSession session) {
        Connection connection = connections.remove(session.getId());
        if (connection != null) {
            RoomRaceRuntime race = races.get(connection.roomCode);
            if (race != null) race.clearInput(connection.userId);
            roomManager.markDisconnected(connection.userId, connection.roomCode);
            broadcastRoomState(connection.roomCode);
            scheduleDisconnectedRemoval(connection);
        }
    }

    private void scheduleDisconnectedRemoval(Connection connection) {
        heartbeatExecutor.schedule(() -> {
            if (roomManager.removeDisconnectedIfExpired(connection.userId, connection.roomCode)) {
                broadcastRoomState(connection.roomCode);
            }
        }, ConnectionTicket.RECONNECT_WINDOW.toSeconds(), TimeUnit.SECONDS);
    }

    @Override
    public void destroy() {
        races.values().forEach(RoomRaceRuntime::close);
        races.clear();
        heartbeatExecutor.shutdownNow();
    }

    static final class Connection {
        private final WebSocketSession session;
        private final UUID userId;
        private final String roomCode;
        private volatile boolean joined;
        private int missedHeartbeats;
        private Instant lastPong = Instant.now();

        private Connection(WebSocketSession session, UUID userId, String roomCode) {
            this.session = session;
            this.userId = userId;
            this.roomCode = roomCode;
        }
    }
}
