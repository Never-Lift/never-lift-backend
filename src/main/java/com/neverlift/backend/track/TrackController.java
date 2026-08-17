package com.neverlift.backend.track;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.neverlift.backend.track.dto.TrackCatalogResponse;

@RestController
@RequestMapping("/api/tracks")
public class TrackController {

    private final TrackService trackService;

    public TrackController(TrackService trackService) {
        this.trackService = trackService;
    }

    @GetMapping
    TrackCatalogResponse getCatalog() {
        return trackService.getCatalog();
    }

    @GetMapping("/{id}")
    JsonNode getDefinition(@PathVariable String id) {
        return trackService.getDefinition(id);
    }
}
