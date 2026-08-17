package com.neverlift.backend.race;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "race_results")
public class RaceResult {

    @Id
    private UUID id;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "track_id", nullable = false, length = 100)
    private String trackId;

    @Column(name = "track_catalog_version", nullable = false, length = 30)
    private String trackCatalogVersion;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RaceMode mode;

    @Column(nullable = false)
    private int position;

    @Column(name = "total_time_ms", nullable = false)
    private long totalTimeMs;

    @Column(name = "best_lap_time_ms", nullable = false)
    private long bestLapTimeMs;

    @Column(nullable = false)
    private boolean finished;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected RaceResult() {
    }

    public RaceResult(
            UUID userId,
            String trackId,
            String trackCatalogVersion,
            RaceMode mode,
            int position,
            long totalTimeMs,
            long bestLapTimeMs,
            boolean finished) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.trackId = trackId;
        this.trackCatalogVersion = trackCatalogVersion;
        this.mode = mode;
        this.position = position;
        this.totalTimeMs = totalTimeMs;
        this.bestLapTimeMs = bestLapTimeMs;
        this.finished = finished;
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getTrackId() {
        return trackId;
    }

    public String getTrackCatalogVersion() {
        return trackCatalogVersion;
    }

    public RaceMode getMode() {
        return mode;
    }

    public int getPosition() {
        return position;
    }

    public long getTotalTimeMs() {
        return totalTimeMs;
    }

    public long getBestLapTimeMs() {
        return bestLapTimeMs;
    }

    public boolean isFinished() {
        return finished;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
