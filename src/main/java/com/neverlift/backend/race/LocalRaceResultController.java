package com.neverlift.backend.race;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.neverlift.backend.race.dto.LocalRaceResultRequest;
import com.neverlift.backend.race.dto.LocalRaceResultResponse;

@RestController
@RequestMapping("/api/races")
public class LocalRaceResultController {

    private final LocalRaceResultService localRaceResultService;

    public LocalRaceResultController(LocalRaceResultService localRaceResultService) {
        this.localRaceResultService = localRaceResultService;
    }

    @PostMapping("/local-result")
    @ResponseStatus(HttpStatus.CREATED)
    LocalRaceResultResponse save(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody LocalRaceResultRequest request) {
        return localRaceResultService.save(jwt, request);
    }
}
