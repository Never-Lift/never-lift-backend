package com.neverlift.backend.room;

import java.util.Locale;

public enum BotDifficulty {
    EASY,
    NORMAL,
    HARD;

    public static BotDifficulty from(String value) {
        if (value == null || value.isBlank()) {
            return NORMAL;
        }
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Unsupported bot difficulty");
        }
    }
}
