package com.neverlift.backend.race.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record LocalRaceResultRequest(
        @NotBlank String trackId,
        @NotBlank String trackCatalogVersion,
        @NotBlank String physicsContractVersion,
        @NotBlank @Pattern(regexp = "solo|local") String mode,
        @NotEmpty @Size(max = 4) List<@Valid LocalRaceEntryRequest> results) {
}
