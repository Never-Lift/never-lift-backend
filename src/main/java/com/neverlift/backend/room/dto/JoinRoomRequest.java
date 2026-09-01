package com.neverlift.backend.room.dto;

import jakarta.validation.constraints.Size;

public record JoinRoomRequest(@Size(max = 100) String password) {
}
