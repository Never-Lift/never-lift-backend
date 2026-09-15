package com.neverlift.backend.race.online;

import com.neverlift.backend.race.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties={"app.version=results-test","spring.datasource.url=jdbc:h2:mem:online_result;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE"})
class OnlineRaceResultIntegrationTest {
    @Autowired OnlineRaceResultService service;
    @Autowired RaceResultRepository repository;
    @Test void completeClassificationCommitsTogetherAndFailureRollsBackEveryRow() {
        var good=new OnlineRaceSession.Standing("bot",null,"Bot",1,20000,9000,true,2,500);
        var missingUser=new OnlineRaceSession.Standing("missing",UUID.randomUUID(),"Missing",2,23000,9500,true,2,500);
        long before=repository.count();
        assertThatThrownBy(()->service.save(new OnlineRaceSession.Result(UUID.randomUUID(),"monaco","2026.12","2.0.3",List.of(good,missingUser)))).isInstanceOf(RuntimeException.class);
        assertThat(repository.count()).isEqualTo(before);
        service.save(new OnlineRaceSession.Result(UUID.randomUUID(),"monaco","2026.12","2.0.3",List.of(good)));
        assertThat(repository.count()).isEqualTo(before+1);
        assertThat(repository.findAll()).allMatch(r->r.getMode()==RaceMode.ONLINE);
    }
}
