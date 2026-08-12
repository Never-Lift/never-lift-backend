package com.neverlift.backend.security;

public enum UserRole {
    USER("user"),
    GUEST("guest");

    private final String claimValue;

    UserRole(String claimValue) {
        this.claimValue = claimValue;
    }

    public String claimValue() {
        return claimValue;
    }
}
