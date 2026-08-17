package com.neverlift.backend.race;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RaceResultRepository extends JpaRepository<RaceResult, UUID> {

    List<RaceResult> findAllByOrderByCreatedAtAsc();
}
