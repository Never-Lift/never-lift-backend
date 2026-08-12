package com.neverlift.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "must not be blank") String gamertag,
        @NotBlank(message = "must not be blank") String password) {
}
