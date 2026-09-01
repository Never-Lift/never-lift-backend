package com.neverlift.backend.room;

public record RoomSettings(
        String trackId,
        String trackCatalogVersion,
        String physicsContractVersion,
        int gridSize,
        boolean botsEnabled,
        BotDifficulty botDifficulty,
        RoomVisibility visibility,
        boolean settingsLocked) {

    public static final String DEFAULT_TRACK_ID = "albert-park";
    public static final String TRACK_CATALOG_VERSION = "2026.12";
    public static final String PHYSICS_CONTRACT_VERSION = "2.0.0";
    public static final int DEFAULT_GRID_SIZE = 22;
    public static final int MIN_GRID_SIZE = 2;
    public static final int MAX_GRID_SIZE = 22;

    public RoomSettings withSettings(
            String nextTrackId,
            int nextGridSize,
            boolean nextBotsEnabled,
            BotDifficulty nextBotDifficulty) {
        return new RoomSettings(
                nextTrackId,
                trackCatalogVersion,
                physicsContractVersion,
                nextGridSize,
                nextBotsEnabled,
                nextBotDifficulty,
                visibility,
                settingsLocked);
    }

    public RoomSettings lock() {
        return new RoomSettings(trackId, trackCatalogVersion, physicsContractVersion,
                gridSize, botsEnabled, botDifficulty, visibility, true);
    }

    public RoomSettings withVisibility(RoomVisibility nextVisibility) {
        return new RoomSettings(trackId, trackCatalogVersion, physicsContractVersion,
                gridSize, botsEnabled, botDifficulty, nextVisibility, settingsLocked);
    }
}
