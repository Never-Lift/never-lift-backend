package com.neverlift.backend.room.dto;

public record LoadoutRequest(String color) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void rejectUnknown(String name, Object value) {
        throw new IllegalArgumentException("Only color is accepted in a loadout");
    }
}
