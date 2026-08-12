package com.neverlift.backend.account.dto;

import jakarta.validation.constraints.NotBlank;

public record DeleteAccountRequest(
        @NotBlank(message = "must not be blank") String currentPassword) {
}
