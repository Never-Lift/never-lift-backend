package com.neverlift.backend.track;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "tracks")
public class Track {

    @Id
    @Column(length = 100)
    private String id;

    @Column(name = "round_number", nullable = false, unique = true)
    private int roundNumber;

    @Column(nullable = false)
    private String name;

    @Column(name = "country_code", nullable = false, length = 2)
    private String countryCode;

    @Column(name = "country_name", nullable = false, length = 100)
    private String countryName;

    @Column(nullable = false, length = 100)
    private String locality;

    @Column(name = "length_meters", nullable = false)
    private int lengthMeters;

    @Column(name = "definition_path", nullable = false)
    private String definitionPath;

    @Column(name = "schema_version", nullable = false, length = 30)
    private String schemaVersion;

    @Column(name = "catalog_version", nullable = false, length = 30)
    private String catalogVersion;

    @Column(name = "definition_json", nullable = false, columnDefinition = "TEXT")
    private String definitionJson;

    protected Track() {
    }

    public Track(
            String id,
            int roundNumber,
            String name,
            String countryCode,
            String countryName,
            String locality,
            int lengthMeters,
            String definitionPath,
            String schemaVersion,
            String catalogVersion,
            String definitionJson) {
        this.id = id;
        this.roundNumber = roundNumber;
        this.name = name;
        this.countryCode = countryCode;
        this.countryName = countryName;
        this.locality = locality;
        this.lengthMeters = lengthMeters;
        this.definitionPath = definitionPath;
        this.schemaVersion = schemaVersion;
        this.catalogVersion = catalogVersion;
        this.definitionJson = definitionJson;
    }

    public String getId() {
        return id;
    }

    public int getRoundNumber() {
        return roundNumber;
    }

    public String getName() {
        return name;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public String getCountryName() {
        return countryName;
    }

    public String getLocality() {
        return locality;
    }

    public int getLengthMeters() {
        return lengthMeters;
    }

    public String getDefinitionPath() {
        return definitionPath;
    }

    public String getSchemaVersion() {
        return schemaVersion;
    }

    public String getCatalogVersion() {
        return catalogVersion;
    }

    public String getDefinitionJson() {
        return definitionJson;
    }
}
