package com.neverlift.backend.account.dto;

import java.time.Instant;
import java.util.UUID;

import com.neverlift.backend.user.User;

public record AccountResponse(
        UUID id,
        String gamertag,
        String displayName,
        String avatarId,
        String preferredLanguage,
        Instant createdAt) {

    public static AccountResponse from(User user) {
        return new AccountResponse(
                user.getId(),
                user.getGamertag(),
                user.getDisplayName(),
                user.getAvatarId(),
                user.getPreferredLanguage(),
                user.getCreatedAt());
    }
}
