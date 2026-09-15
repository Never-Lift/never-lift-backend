package com.neverlift.backend.race.online;

import com.neverlift.backend.race.physics.PhysicsContract;
import com.neverlift.backend.room.dto.RoomResponse;
import org.springframework.stereotype.Component;

@Component
public class OnlineRaceSessionFactory {
    public OnlineRaceSession create(RoomResponse room) {
        return new OnlineRaceSession(new PhysicsContract(),PhysicsContract.resource("tracks/"+room.trackId()+".json"),
                room.players().stream().map(p->new OnlineRaceSession.Participant(p.id().toString(),p.userId(),p.displayName(),p.color(),p.bot())).toList(),
                room.settings().laps(),room.settings().botDifficulty(),System.currentTimeMillis());
    }
}
