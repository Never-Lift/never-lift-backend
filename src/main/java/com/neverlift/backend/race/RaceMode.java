package com.neverlift.backend.race;

import java.util.Locale;

public enum RaceMode {
    SOLO,
    LOCAL;

    public static RaceMode fromWireValue(String value) {
        return RaceMode.valueOf(value.toUpperCase(Locale.ROOT));
    }
}
