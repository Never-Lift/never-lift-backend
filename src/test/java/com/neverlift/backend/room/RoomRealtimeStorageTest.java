package com.neverlift.backend.room;

import com.neverlift.backend.room.dto.CreateRoomRequest;
import jakarta.persistence.EntityManagerFactory;
import com.zaxxer.hikari.HikariDataSource;
import javax.sql.DataSource;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.assertThat;

/** Exercise the real Spring proxy: a plain new RoomManager would hide transactions. */
@SpringBootTest(properties = {
        "app.version=module-3c-storage-test",
        "spring.datasource.hikari.allow-pool-suspension=true",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "logging.level.org.hibernate.stat=OFF",
        "logging.level.org.hibernate.engine.internal.StatisticalLoggingSessionEventListener=OFF"
})
class RoomRealtimeStorageTest {
    @Autowired RoomManager rooms;
    @Autowired EntityManagerFactory entities;
    @Autowired DataSource dataSource;

    @Test
    void realtimeRoomReadsAndPublicListingDoNotStartDatabaseTransactions() {
        UUID host = UUID.randomUUID();
        var room = rooms.create(host, new CreateRoomRequest("Storage isolation", "suzuka", 3, true, "easy", "public"));
        var statistics = entities.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        try {
            // Inputs and publications call get repeatedly; no repository is needed.
            for (int i = 0; i < 100; i++) assertThat(rooms.get(room.code()).code()).isEqualTo(room.code());
            assertThat(rooms.listPublic()).anyMatch(candidate -> candidate.code().equals(room.code()));
            assertThat(statistics.getTransactionCount()).as("in-memory room reads must not open JPA transactions").isZero();
            assertThat(statistics.getConnectCount()).as("in-memory room reads must not acquire JDBC connections").isZero();
            assertThat(statistics.getPrepareStatementCount()).isZero();
        } finally {
            rooms.close(host, room.code());
        }
    }

    @Test
    void roomReadsRemainAvailableWhenDatabaseConnectionsAreSuspended() throws Exception {
        UUID host = UUID.randomUUID();
        var room = rooms.create(host, new CreateRoomRequest("Offline storage", "suzuka", 3, true, "easy", "public"));
        var pool = dataSource.unwrap(HikariDataSource.class).getHikariPoolMXBean();
        var executor = Executors.newSingleThreadExecutor();
        pool.suspendPool();
        try {
            var response = executor.submit(() -> {
                for (int i = 0; i < 100; i++) rooms.get(room.code());
                return rooms.listPublic();
            }).get(2, TimeUnit.SECONDS);
            assertThat(response).anyMatch(candidate -> candidate.code().equals(room.code()));
        } finally {
            pool.resumePool();
            executor.shutdownNow();
            executor.awaitTermination(2, TimeUnit.SECONDS);
            rooms.close(host, room.code());
        }
    }
}
