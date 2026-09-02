package com.neverlift.backend.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import com.neverlift.backend.error.ApiException;
import com.neverlift.backend.room.dto.CreateRoomRequest;
import com.neverlift.backend.room.dto.RoomResponse;
import com.neverlift.backend.room.dto.RoomSettingsRequest;

class RoomManagerTest {

    private MutableClock clock;
    private RoomManager manager;
    private UUID host;
    private UUID second;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-09-01T12:00:00Z"));
        manager = new RoomManager(clock);
        host = UUID.randomUUID();
        second = UUID.randomUUID();
    }

    @Test
    void createsTwentyTwoSlotPublicRoomAndSupportsJoinAndTicket() {
        RoomResponse created = manager.create(host,
                new CreateRoomRequest(null, null, null, null, null, null));

        assertThat(created.name()).isEqualTo("Room " + created.code());
        assertThat(created.limit()).isEqualTo(22);
        assertThat(created.settings().visibility()).isEqualTo("public");
        assertThat(created.settings().botsEnabled()).isFalse();

        manager.join(second, created.code(), "https://frontend.example");
        var ticket = manager.issueTicket(second, created.code());
        assertThat(ticket.expiresAt()).isEqualTo(clock.instant().plusSeconds(60));

        ConnectionTicket consumed = manager.consumeTicket(ticket.ticket(), second, created.code());
        assertThat(consumed.getUserId()).isEqualTo(second);
        assertThatThrownBy(() -> manager.consumeTicket(ticket.ticket(), second, created.code()))
                .isInstanceOf(ApiException.class)
                .satisfies(error -> assertThat(((ApiException) error).getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED));

        var expiringTicket = manager.issueTicket(host, created.code());
        clock.advanceSeconds(60);
        assertThatThrownBy(() -> manager.consumeTicket(expiringTicket.ticket(), host, created.code()))
                .isInstanceOf(ApiException.class)
                .satisfies(error -> assertThat(((ApiException) error).getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    @Test
    void enforcesCapacityAndGenericRateLimitedJoinErrors() {
        RoomResponse room = manager.create(host,
                new CreateRoomRequest("Public", null, 2, false, null, "public"));
        assertThat(manager.joinAttemptsRemaining(second, "https://frontend.example")).isEqualTo(5);

        for (int attempt = 0; attempt < 5; attempt++) {
            assertThatThrownBy(() -> manager.join(second, "9999", "https://frontend.example"))
                    .isInstanceOf(ApiException.class)
                    .satisfies(error -> assertThat(((ApiException) error).getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
        }
        assertThatThrownBy(() -> manager.join(second, room.code(), "https://frontend.example"))
                .isInstanceOf(ApiException.class)
                .satisfies(error -> assertThat(((ApiException) error).getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));

        clock.advanceSeconds(61);
        RoomResponse joined = manager.join(second, room.code(), "https://frontend.example");
        assertThat(joined.participantCount()).isEqualTo(2);
    }

    @Test
    void listsOnlyPublicLobbyRoomsAndKeepsPrivateRoomsAccessibleOnlyByCode() {
        RoomResponse publicRoom = manager.create(host,
                new CreateRoomRequest("Public", null, null, null, null, "public"));
        RoomResponse privateRoom = manager.create(second,
                new CreateRoomRequest("Private", null, null, null, null, "private"));

        assertThat(manager.listPublic()).extracting(RoomResponse::code).contains(publicRoom.code())
                .doesNotContain(privateRoom.code());
        assertThat(manager.join(UUID.randomUUID(), privateRoom.code(), "origin").code())
                .isEqualTo(privateRoom.code());
    }

    @Test
    void keepsSettingsEditableAndReadyStatesWhenHostUpdatesTheLobby() {
        RoomResponse room = manager.create(host,
                new CreateRoomRequest("Lobby", null, 3, false, null, null));
        manager.join(second, room.code(), "origin");
        RoomResponse updated = manager.updateSettings(host, room.code(),
                new RoomSettingsRequest("monaco", 3, false, null, null));

        assertThat(updated.trackId()).isEqualTo("monaco");
        assertThat(updated.settingsLocked()).isFalse();
        assertThat(updated.hostName()).isEqualTo(host.toString());

        assertThatThrownBy(() -> manager.setReady(host, room.code(), true))
                .isInstanceOf(ApiException.class)
                .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo("host_does_not_ready"));

        manager.setReady(second, room.code(), true);
        RoomResponse started = manager.start(host, room.code());
        assertThat(started.state()).isEqualTo("qualifying");
        assertThat(started.settingsLocked()).isTrue();

        RoomResponse afterPlayerLeaves = manager.leave(second, room.code());
        assertThat(afterPlayerLeaves.participantCount()).isEqualTo(1);
        RoomResponse afterHostLeaves = manager.leave(host, room.code());
        assertThat(afterHostLeaves.participantCount()).isZero();
        assertThat(afterHostLeaves.hostId()).isNull();
    }

    @Test
    void transfersHostAndExpiresEmptyRoomAfterTenMinutes() {
        RoomResponse room = manager.create(host,
                new CreateRoomRequest("Transfer", null, 2, false, null, null));
        manager.join(second, room.code(), "origin");
        RoomResponse afterHostLeaves = manager.leave(host, room.code());
        assertThat(afterHostLeaves.hostId()).isEqualTo(second);

        manager.leave(second, room.code());
        clock.advanceSeconds(599);
        assertThat(manager.cleanupExpiredRooms()).isZero();
        clock.advanceSeconds(1);
        assertThat(manager.cleanupExpiredRooms()).isEqualTo(1);
        assertThat(manager.roomCount()).isZero();
    }

    @Test
    void usesGenericErrorsForMalformedCodesAndFullRooms() {
        assertThatThrownBy(() -> manager.join(second, "12", "origin"))
                .isInstanceOf(ApiException.class)
                .satisfies(error -> {
                    ApiException apiError = (ApiException) error;
                    assertThat(apiError.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(apiError.getCode()).isEqualTo("room_join_failed");
                    assertThat(apiError.getMessage()).isEqualTo("Unable to join that room");
                });

        RoomResponse room = manager.create(host,
                new CreateRoomRequest("Full", null, 2, false, null, null));
        manager.join(second, room.code(), "origin");
        UUID third = UUID.randomUUID();
        assertThatThrownBy(() -> manager.join(third, room.code(), "origin"))
                .isInstanceOf(ApiException.class)
                .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo("room_join_failed"));
    }

    @Test
    void allowsTicketReconnectWithinThirtySecondsOfDisconnect() {
        RoomResponse room = manager.create(host,
                new CreateRoomRequest(null, null, null, null, null, null));
        var ticket = manager.issueTicket(host, room.code());
        clock.advanceSeconds(20);
        manager.consumeTicket(ticket.ticket(), host, room.code());
        manager.markDisconnected(host, room.code());
        assertThat(manager.get(room.code()).players().get(0).connected()).isFalse();
        clock.advanceSeconds(29);
        manager.consumeTicket(ticket.ticket(), host, room.code());

        manager.markDisconnected(host, room.code());
        clock.advanceSeconds(31);
        assertThatThrownBy(() -> manager.consumeTicket(ticket.ticket(), host, room.code()))
                .isInstanceOf(ApiException.class)
                .satisfies(error -> assertThat(((ApiException) error).getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    @Test
    void removesDisconnectedParticipantOnlyAfterReconnectWindow() {
        RoomResponse room = manager.create(host,
                new CreateRoomRequest(null, null, 2, false, null, null));
        manager.join(second, room.code(), "origin");
        manager.markDisconnected(second, room.code());

        clock.advanceSeconds(29);
        assertThat(manager.removeDisconnectedIfExpired(second, room.code())).isFalse();
        assertThat(manager.get(room.code()).participantCount()).isEqualTo(2);

        clock.advanceSeconds(1);
        assertThat(manager.removeDisconnectedIfExpired(second, room.code())).isTrue();
        assertThat(manager.get(room.code()).participantCount()).isEqualTo(1);
    }

    @Test
    void fillsConfiguredGridWithReadyBotsOnlyWhenHostStarts() {
        RoomResponse room = manager.create(host,
                new CreateRoomRequest(null, null, 4, true, "hard", null));

        RoomResponse started = manager.start(host, room.code());
        assertThat(started.participantCount()).isEqualTo(4);
        assertThat(started.players()).filteredOn(player -> player.bot()).allMatch(player -> player.ready());
        assertThat(started.players().stream().filter(player -> player.bot()).count()).isEqualTo(3);
    }

    @Test
    void cancelsQualificationBeforeDrivingAndRejectsCancellationAfterDrivingStarts() {
        RoomResponse room = manager.create(host,
                new CreateRoomRequest("Qualifying", null, 3, true, "normal", null));
        RoomResponse started = manager.start(host, room.code());
        assertThat(started.state()).isEqualTo("qualifying");
        assertThat(started.participantCount()).isEqualTo(3);

        RoomResponse cancelled = manager.cancelQualification(host, room.code());
        assertThat(cancelled.state()).isEqualTo("lobby");
        assertThat(cancelled.settingsLocked()).isFalse();
        assertThat(cancelled.participantCount()).isEqualTo(1);

        manager.start(host, room.code());
        manager.markDrivingStarted(room.code());
        assertThatThrownBy(() -> manager.cancelQualification(host, room.code()))
                .isInstanceOf(ApiException.class)
                .satisfies(error -> assertThat(((ApiException) error).getCode())
                        .isEqualTo("qualification_already_driving"));
    }

    static final class MutableClock extends Clock {
        private Instant current;

        MutableClock(Instant current) {
            this.current = current;
        }

        void advanceSeconds(long seconds) {
            current = current.plusSeconds(seconds);
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return current;
        }
    }
}
