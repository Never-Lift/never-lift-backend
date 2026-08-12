package com.neverlift.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record RegisterRequest(
        @NotBlank(message = "must not be blank")
        @Pattern(regexp = "\\S+", message = "must not contain whitespace")
        String gamertag,

        @NotBlank(message = "must not be blank")
        String displayName,

        @NotBlank(message = "must not be blank")
        @Pattern(regexp = "\\S{4,}", message = "must have at least 4 characters and no whitespace")
        String password) {
}
