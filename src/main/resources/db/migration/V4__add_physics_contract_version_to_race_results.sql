ALTER TABLE race_results
    ADD COLUMN physics_contract_version VARCHAR(30) NOT NULL DEFAULT '1.3.0';

ALTER TABLE race_results
    ALTER COLUMN physics_contract_version DROP DEFAULT;

CREATE INDEX idx_race_results_contract_track_created_at
    ON race_results (physics_contract_version, track_id, created_at DESC);
