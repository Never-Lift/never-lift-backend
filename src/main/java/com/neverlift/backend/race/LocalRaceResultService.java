package com.neverlift.backend.race;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.neverlift.backend.error.ApiException;
import com.neverlift.backend.race.dto.LocalRaceEntryRequest;
import com.neverlift.backend.race.dto.LocalRaceResultRequest;
import com.neverlift.backend.race.dto.LocalRaceResultResponse;
import com.neverlift.backend.security.UserRole;
import com.neverlift.backend.track.Track;
import com.neverlift.backend.track.TrackRepository;
import com.neverlift.backend.user.UserRepository;

@Service
public class LocalRaceResultService {

    private final RaceResultRepository raceResultRepository;
    private final TrackRepository trackRepository;
    private final UserRepository userRepository;

    public LocalRaceResultService(
            RaceResultRepository raceResultRepository,
            TrackRepository trackRepository,
            UserRepository userRepository) {
        this.raceResultRepository = raceResultRepository;
        this.trackRepository = trackRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public LocalRaceResultResponse save(Jwt jwt, LocalRaceResultRequest request) {
        Track track = trackRepository.findById(request.trackId())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "track_not_found",
                        "Track does not exist in the active catalog"));
        if (!track.getCatalogVersion().equals(request.trackCatalogVersion())) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "catalog_version_mismatch",
                    "Track catalog version does not match the active catalog");
        }

        validateRaceEntries(request.results());
        UUID authenticatedUserId = validateIdentity(jwt, request.results());
        RaceMode mode = RaceMode.fromWireValue(request.mode());

        List<RaceResult> results = request.results().stream()
                .map(entry -> new RaceResult(
                        entry.userIdOrNull() == null ? null : authenticatedUserId,
                        track.getId(),
                        track.getCatalogVersion(),
                        mode,
                        entry.position(),
                        entry.totalTimeMs(),
                        entry.bestLapTimeMs(),
                        entry.finished()))
                .toList();
        List<RaceResult> saved = raceResultRepository.saveAll(results);
        return new LocalRaceResultResponse(
                saved.size(),
                saved.stream().map(RaceResult::getId).toList());
    }

    private void validateRaceEntries(List<LocalRaceEntryRequest> results) {
        Set<Integer> positions = new HashSet<>();
        for (LocalRaceEntryRequest result : results) {
            if (result.position() > results.size() || !positions.add(result.position())) {
                throw new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "invalid_positions",
                        "Race positions must be a unique sequence from 1 to the number of results");
            }
            if (result.finished() && (result.totalTimeMs() == 0 || result.bestLapTimeMs() == 0)) {
                throw new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "invalid_finished_time",
                        "A finished result must contain positive total and best lap times");
            }
            if (result.bestLapTimeMs() > result.totalTimeMs()) {
                throw new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "invalid_best_lap_time",
                        "Best lap time cannot exceed total race time");
            }
        }
    }

    private UUID validateIdentity(Jwt jwt, List<LocalRaceEntryRequest> results) {
        String role = jwt.getClaimAsString("role");
        if (UserRole.GUEST.claimValue().equals(role)) {
            if (results.stream().anyMatch(result -> result.userIdOrNull() != null)) {
                throw identityMismatch();
            }
            return null;
        }
        if (!UserRole.USER.claimValue().equals(role)) {
            throw identityMismatch();
        }

        UUID authenticatedUserId;
        try {
            authenticatedUserId = UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException exception) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "invalid_token_subject",
                    "Authenticated user identifier is invalid");
        }
        if (!userRepository.existsById(authenticatedUserId)) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "account_not_found",
                    "Authenticated account no longer exists");
        }

        long associatedResults = 0;
        for (LocalRaceEntryRequest result : results) {
            if (result.userIdOrNull() == null) {
                continue;
            }
            if (!authenticatedUserId.equals(result.userIdOrNull())) {
                throw identityMismatch();
            }
            associatedResults++;
        }
        if (associatedResults != 1) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "authenticated_result_required",
                    "Exactly one result must represent the authenticated user");
        }
        return authenticatedUserId;
    }

    private ApiException identityMismatch() {
        return new ApiException(
                HttpStatus.FORBIDDEN,
                "result_identity_mismatch",
                "Race results cannot be assigned to another account");
    }
}
