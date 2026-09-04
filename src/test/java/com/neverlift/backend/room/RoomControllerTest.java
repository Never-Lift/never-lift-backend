package com.neverlift.backend.room;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import com.neverlift.backend.room.dto.RoomResponse;

class RoomControllerTest {

    private RoomManager roomManager;
    private RoomWebSocketHandler roomWebSocketHandler;
    private RoomController controller;
    private Jwt jwt;
    private UUID userId;

    @BeforeEach
    void setUp() {
        roomManager = mock(RoomManager.class);
        roomWebSocketHandler = mock(RoomWebSocketHandler.class);
        controller = new RoomController(roomManager, roomWebSocketHandler);
        jwt = mock(Jwt.class);
        userId = UUID.randomUUID();
        when(jwt.getSubject()).thenReturn(userId.toString());
    }

    @Test
    void broadcastsPresenceImmediatelyAfterRestJoin() {
        RoomResponse response = mock(RoomResponse.class);
        when(roomManager.join(userId, "1234", "https://frontend.example"))
                .thenReturn(response);

        controller.join(jwt, "1234", "https://frontend.example");

        verify(roomWebSocketHandler).broadcastRoomState("1234");
    }

    @Test
    void disconnectsLeavingParticipantAndBroadcastsTheReleasedSlot() {
        RoomResponse response = mock(RoomResponse.class);
        when(roomManager.leave(userId, "1234")).thenReturn(response);
        when(response.participantCount()).thenReturn(1);

        controller.leave(jwt, "1234");

        verify(roomWebSocketHandler).disconnectParticipant(
                "1234", userId, "left_room", "Você saiu da sala.");
        verify(roomWebSocketHandler).broadcastRoomState("1234");
    }

    @Test
    void doesNotBroadcastAnInvalidHostlessStateAfterTheLastParticipantLeaves() {
        RoomResponse response = mock(RoomResponse.class);
        when(roomManager.leave(userId, "1234")).thenReturn(response);

        controller.leave(jwt, "1234");

        verify(roomWebSocketHandler).disconnectParticipant(
                "1234", userId, "left_room", "Você saiu da sala.");
        verify(roomWebSocketHandler, never()).broadcastRoomState("1234");
        verify(roomWebSocketHandler).stopRace("1234");
    }

    @Test
    void disconnectsRemovedParticipantAndBroadcastsModeration() {
        UUID participantId = UUID.randomUUID();
        RoomResponse response = mock(RoomResponse.class);
        when(roomManager.remove(userId, "1234", participantId)).thenReturn(response);

        controller.remove(jwt, "1234", participantId);

        verify(roomWebSocketHandler).disconnectParticipant(
                "1234", participantId, "removed_from_room",
                "Você foi removido da sala pelo host.");
        verify(roomWebSocketHandler).broadcastRoomState("1234");
    }

    @Test
    void broadcastsQualificationCancellation() {
        RoomResponse response = mock(RoomResponse.class);
        when(roomManager.cancelQualification(userId, "1234")).thenReturn(response);

        controller.cancelQualification(jwt, "1234");

        verify(roomWebSocketHandler).broadcastRoomState("1234");
    }
}
