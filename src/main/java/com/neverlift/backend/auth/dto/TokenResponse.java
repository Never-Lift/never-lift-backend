package com.neverlift.backend.auth.dto;

import java.util.UUID;

import com.neverlift.backend.auth.JwtService.IssuedToken;

public record TokenResponse(
        String token,
        String tokenType,
        long expiresIn,
        String role,
        UUID subject) {

    public static TokenResponse from(IssuedToken issuedToken) {
        return new TokenResponse(
                issuedToken.token(),
                "Bearer",
                issuedToken.expiresIn(),
                issuedToken.role(),
                issuedToken.subject());
    }
}
