package com.neverlift.backend.user;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByGamertag(String gamertag);

    boolean existsByGamertag(String gamertag);
}
