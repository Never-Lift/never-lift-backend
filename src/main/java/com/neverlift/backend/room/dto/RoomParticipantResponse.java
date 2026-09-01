package com.neverlift.backend.room.dto;

import java.time.Instant;
import java.util.UUID;

import com.neverlift.backend.room.RoomParticipant;

public record RoomParticipantResponse(
        UUID id,
        UUID userId,
        String displayName,
        boolean bot,
        boolean ready,
        boolean connected,
        String color,
        Instant joinedAt) {

    public static RoomParticipantResponse from(RoomParticipant participant) {
        return new RoomParticipantResponse(
                participant.getId(),
                participant.getUserId(),
                participant.getDisplayName(),
                participant.isBot(),
                participant.isReady(),
                participant.isConnected(),
                participant.getColor(),
                participant.getJoinedAt());
    }
}
