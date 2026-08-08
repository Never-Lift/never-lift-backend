package com.neverlift.backend.health;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
public class HealthController {

    private final String applicationVersion;

    public HealthController(@Value("${app.version}") String applicationVersion) {
        this.applicationVersion = applicationVersion;
    }

    @GetMapping
    public HealthResponse health() {
        return new HealthResponse("UP", applicationVersion);
    }

    public record HealthResponse(String status, String version) {
    }
}
