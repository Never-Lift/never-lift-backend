package com.neverlift.backend.room;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;

import com.neverlift.backend.room.dto.RoomResponse;

class RoomWebSocketHandlerTest {

    private RoomManager roomManager;
    private RoomWebSocketHandler handler;

    @BeforeEach
    void setUp() {
        roomManager = mock(RoomManager.class);
        handler = new RoomWebSocketHandler(roomManager, new ObjectMapper());
    }

    @AfterEach
    void tearDown() {
        handler.destroy();
    }

    @Test
    void authenticatesLobbyMessagesWithTicketAndRejectsIncompatibleVersion() throws Exception {
        UUID userId = UUID.randomUUID();
        String roomCode = "1234";
        ConnectionTicket ticket = new ConnectionTicket("ticket", userId, roomCode, Instant.now());
        WebSocketSession session = mockSession(ticket);
        when(session.isOpen()).thenReturn(true);
        when(roomManager.get(roomCode)).thenReturn(room(roomCode, userId));

        handler.afterConnectionEstablished(session);
        handler.handleMessage(session, new org.springframework.web.socket.TextMessage("""
                {"type":"join_room","payload":{"roomCode":"1234","trackCatalogVersion":"2026.12","physicsContractVersion":"wrong"}}
                """));

        verify(session, atLeastOnce()).sendMessage(any(WebSocketMessage.class));
    }

    @Test
    void closesAfterThreeHeartbeatSendFailuresAndKeepsLobbyPlayerForReconnect() throws Exception {
        UUID userId = UUID.randomUUID();
        String roomCode = "1234";
        ConnectionTicket ticket = new ConnectionTicket("ticket", userId, roomCode, Instant.now());
        WebSocketSession session = mockSession(ticket);
        when(session.isOpen()).thenReturn(true);
        when(roomManager.get(roomCode)).thenReturn(room(roomCode, userId));
        handler.afterConnectionEstablished(session);
        doThrow(new java.io.IOException("closed")).when(session).sendMessage(any(WebSocketMessage.class));
        handler.runHeartbeatCycle();
        handler.runHeartbeatCycle();
        handler.runHeartbeatCycle();

        verify(roomManager).markDisconnected(userId, roomCode);
        verify(session).close(CloseStatus.SESSION_NOT_RELIABLE);
    }

    @Test
    void closedSocketRaceDoesNotInterruptBroadcastToOtherPlayers() throws Exception {
        UUID hostId = UUID.randomUUID();
        when(roomManager.get("1234")).thenReturn(room("1234", hostId));
        WebSocketSession closing = mockSession(new ConnectionTicket("closing", hostId, "1234", Instant.now()));
        WebSocketSession healthy = mockSession(new ConnectionTicket("healthy", UUID.randomUUID(), "1234", Instant.now()));
        when(closing.isOpen()).thenReturn(true);
        when(healthy.isOpen()).thenReturn(true);
        handler.afterConnectionEstablished(closing);
        handler.afterConnectionEstablished(healthy);
        doThrow(new IllegalStateException("WebSocket session has been closed"))
                .when(closing).sendMessage(any(WebSocketMessage.class));

        org.assertj.core.api.Assertions.assertThatCode(() -> handler.broadcastRoomState("1234"))
                .doesNotThrowAnyException();
        verify(healthy).sendMessage(any(WebSocketMessage.class));
    }

    @Test
    void closedSocketRaceCountsAsHeartbeatFailureInsteadOfStoppingScheduler() throws Exception {
        UUID userId = UUID.randomUUID();
        WebSocketSession session = mockSession(new ConnectionTicket("closing", userId, "1234", Instant.now()));
        when(session.isOpen()).thenReturn(true);
        when(roomManager.get("1234")).thenReturn(room("1234", userId));
        handler.afterConnectionEstablished(session);
        doThrow(new IllegalStateException("WebSocket session has been closed"))
                .when(session).sendMessage(any(WebSocketMessage.class));

        handler.runHeartbeatCycle();
        handler.runHeartbeatCycle();
        handler.runHeartbeatCycle();
        verify(roomManager).markDisconnected(userId, "1234");
        verify(session).close(CloseStatus.SESSION_NOT_RELIABLE);
    }

    @Test
    void broadcastsJoinAndSupportsReadyCancellationAndHostStart() throws Exception {
        UUID userId = UUID.randomUUID();
        String roomCode = "1234";
        ConnectionTicket ticket = new ConnectionTicket("ticket", userId, roomCode, Instant.now());
        WebSocketSession session = mockSession(ticket);
        when(session.isOpen()).thenReturn(true);
        when(roomManager.get(roomCode)).thenReturn(room(roomCode, userId));
        handler.afterConnectionEstablished(session);

        handler.handleMessage(session, new org.springframework.web.socket.TextMessage("""
                {"type":"join_room","payload":{"roomCode":"1234","trackCatalogVersion":"2026.12","physicsContractVersion":"2.0.3"}}
                """));
        handler.handleMessage(session, new org.springframework.web.socket.TextMessage("""
                {"type":"ready","payload":{"ready":false}}
                """));
        handler.handleMessage(session, new org.springframework.web.socket.TextMessage("""
                {"type":"start_race","payload":{}}
                """));

        verify(roomManager).setReady(userId, roomCode, false);
        verify(roomManager).start(userId, roomCode);
        verify(session, atLeastOnce()).sendMessage(any(WebSocketMessage.class));
    }

    private WebSocketSession mockSession(ConnectionTicket ticket) {
        WebSocketSession session = mock(WebSocketSession.class);
        Map<String, Object> attributes = new HashMap<>();
        attributes.put(RoomWebSocketHandler.TICKET_ATTRIBUTE, ticket);
        when(session.getId()).thenReturn(UUID.randomUUID().toString());
        when(session.getAttributes()).thenReturn(attributes);
        return session;
    }

    private RoomResponse room(String code, UUID hostId) {
        return new RoomResponse(code, "Test", hostId, "Host", "albert-park", "2026.12", "2.0.3", 1, 22,
                new RoomResponse.RoomResponseSettings("albert-park", "2026.12", "2.0.3", 22,
                        false, "normal", "public", false), "lobby", false, java.util.List.of(), Map.of());
    }
}
