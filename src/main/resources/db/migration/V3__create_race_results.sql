CREATE TABLE race_results (
    id UUID PRIMARY KEY,
    user_id UUID,
    track_id VARCHAR(100) NOT NULL,
    track_catalog_version VARCHAR(30) NOT NULL,
    mode VARCHAR(20) NOT NULL,
    position INTEGER NOT NULL,
    total_time_ms BIGINT NOT NULL,
    best_lap_time_ms BIGINT NOT NULL,
    finished BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_race_results_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_race_results_track FOREIGN KEY (track_id)
        REFERENCES tracks (id),
    CONSTRAINT chk_race_results_mode CHECK (mode IN ('SOLO', 'LOCAL')),
    CONSTRAINT chk_race_results_position CHECK (position > 0),
    CONSTRAINT chk_race_results_total_time CHECK (total_time_ms >= 0),
    CONSTRAINT chk_race_results_best_lap CHECK (best_lap_time_ms >= 0)
);

CREATE INDEX idx_race_results_user_created_at
    ON race_results (user_id, created_at DESC);

CREATE INDEX idx_race_results_track_created_at
    ON race_results (track_id, created_at DESC);
