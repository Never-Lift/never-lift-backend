CREATE TABLE users (
    id UUID PRIMARY KEY,
    gamertag VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    avatar_id VARCHAR(255),
    preferred_language VARCHAR(35),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uk_users_gamertag UNIQUE (gamertag)
);
