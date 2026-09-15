package com.neverlift.backend.race.online;

import com.neverlift.backend.race.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** One transaction for the complete classification, called off the physics thread. */
@Service
public class OnlineRaceResultService {
    private final RaceResultRepository repository;
    public OnlineRaceResultService(RaceResultRepository repository){this.repository=repository;}
    @Transactional
    public void save(OnlineRaceSession.Result result) {
        repository.saveAllAndFlush(result.standings().stream().map(entry->new RaceResult(
                entry.userId(),result.trackId(),result.trackCatalogVersion(),result.physicsContractVersion(),
                RaceMode.ONLINE,entry.position(),entry.totalTimeMs(),entry.bestLapTimeMs(),entry.finished())).toList());
    }
}
