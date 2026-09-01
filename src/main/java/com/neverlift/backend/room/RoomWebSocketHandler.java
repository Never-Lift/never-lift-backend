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

/** Lobby protocol only. Physics and race snapshots belong to Parts 3b/3c. */
@Component
public class RoomWebSocketHandler extends AbstractWebSocketHandler implements DisposableBean {

    public static final String TICKET_ATTRIBUTE = "connectionTicket";
    public static final String USER_ID_ATTRIBUTE = "userId";
    public static final String ROOM_CODE_ATTRIBUTE = "roomCode";
    private static final int MAX_MISSED_HEARTBEATS = 3;

    private final RoomManager roomManager;
    private final ObjectMapper objectMapper;
    private final Map<String, Connection> connections = new ConcurrentHashMap<>();
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
                    roomManager.setReady(connection.userId, connection.roomCode, true);
                    broadcastRoomState(connection.roomCode);
                }
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
        if (!connection.roomCode.equals(roomCode)
                || !RoomSettings.TRACK_CATALOG_VERSION.equals(trackCatalogVersion)
                || !RoomSettings.PHYSICS_CONTRACT_VERSION.equals(physicsContractVersion)) {
            sendError(session, "incompatible_protocol", "Room protocol version is not supported");
            return;
        }
        connection.joined = true;
        sendRoomState(session, connection.roomCode);
    }

    private void sendRoomState(WebSocketSession session, String roomCode) throws IOException {
        sendEnvelope(session, "room_state", RoomStatePayload.from(roomManager.get(roomCode)));
    }

    private void broadcastRoomState(String roomCode) {
        RoomResponse state = roomManager.get(roomCode);
        connections.values().stream()
                .filter(connection -> roomCode.equals(connection.roomCode))
                .forEach(connection -> sendEnvelopeQuietly(connection.session, "room_state", RoomStatePayload.from(state)));
    }

    private void sendEnvelope(WebSocketSession session, String type, Object payload) throws IOException {
        Map<String, Object> envelope = Map.of("type", type, "payload", payload);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(envelope)));
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
                connection.session.sendMessage(new org.springframework.web.socket.PingMessage());
            } catch (IOException exception) {
                missed = true;
            }
            if (missed) {
                connection.missedHeartbeats++;
            }
            if (connection.missedHeartbeats >= MAX_MISSED_HEARTBEATS) {
                connections.remove(connection.session.getId(), connection);
                roomManager.markDisconnected(connection.userId, connection.roomCode);
                try {
                    connection.session.close(CloseStatus.SESSION_NOT_RELIABLE);
                } catch (IOException ignored) {
                    // The close callback still removes the connection.
                }
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
            roomManager.markDisconnected(connection.userId, connection.roomCode);
        }
    }

    @Override
    public void destroy() {
        heartbeatExecutor.shutdownNow();
    }

    static final class Connection {
        private final WebSocketSession session;
        private final UUID userId;
        private final String roomCode;
        private boolean joined;
        private int missedHeartbeats;
        private Instant lastPong = Instant.now();

        private Connection(WebSocketSession session, UUID userId, String roomCode) {
            this.session = session;
            this.userId = userId;
            this.roomCode = roomCode;
        }
    }
}
