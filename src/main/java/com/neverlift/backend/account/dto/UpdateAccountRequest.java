package com.neverlift.backend.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record UpdateAccountRequest(
        @NotBlank(message = "must not be blank")
        String currentPassword,

        @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank")
        String displayName,

        String avatarId,

        @Pattern(regexp = "\\S{4,}", message = "must have at least 4 characters and no whitespace")
        String password) {
}
