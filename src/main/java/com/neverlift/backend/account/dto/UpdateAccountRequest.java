package com.neverlift.backend.account.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public final class UpdateAccountRequest {

    @NotBlank(message = "must not be blank")
    private String currentPassword;

    @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank")
    private String displayName;

    private String avatarId;
    private boolean avatarIdIncluded;

    @Pattern(regexp = "\\S{4,}", message = "must have at least 4 characters and no whitespace")
    private String password;

    public String currentPassword() {
        return currentPassword;
    }

    public void setCurrentPassword(String currentPassword) {
        this.currentPassword = currentPassword;
    }

    public String displayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String avatarId() {
        return avatarId;
    }

    @JsonSetter("avatarId")
    public void setAvatarId(String avatarId) {
        this.avatarId = avatarId;
        this.avatarIdIncluded = true;
    }

    public boolean includesAvatarId() {
        return avatarIdIncluded;
    }

    public String password() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}
