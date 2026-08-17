CREATE TABLE tracks (
    id VARCHAR(100) PRIMARY KEY,
    round_number INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    country_name VARCHAR(100) NOT NULL,
    locality VARCHAR(100) NOT NULL,
    length_meters INTEGER NOT NULL,
    definition_path VARCHAR(255) NOT NULL,
    schema_version VARCHAR(30) NOT NULL,
    catalog_version VARCHAR(30) NOT NULL,
    definition_json TEXT NOT NULL,
    CONSTRAINT uk_tracks_round UNIQUE (round_number),
    CONSTRAINT chk_tracks_round CHECK (round_number BETWEEN 1 AND 24),
    CONSTRAINT chk_tracks_length CHECK (length_meters > 0)
);
