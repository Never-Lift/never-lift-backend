package com.neverlift.backend.room.dto;

import java.time.Instant;

public record ConnectionTicketResponse(String ticket, String roomCode, Instant expiresAt) {
}
