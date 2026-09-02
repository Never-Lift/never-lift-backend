package com.neverlift.backend.room;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Ephemeral lobby state. A room is deliberately not a JPA entity: it is live
 * matchmaking state and is rebuilt after a process restart.
 */
public final class Room {

    private final String code;
    private final String name;
    private final UUID createdBy;
    private final Instant createdAt;
    private final Map<UUID, RoomParticipant> participants = new LinkedHashMap<>();
    private RoomSettings settings;
    private UUID hostId;
    private RoomState state = RoomState.LOBBY;
    private boolean drivingStarted;
    private Instant emptySince;

    Room(String code, String name, UUID hostId, Instant createdAt,
            RoomSettings settings) {
        this(code, name, hostId, hostId.toString(), createdAt, settings);
    }

    Room(String code, String name, UUID hostId, String hostDisplayName, Instant createdAt,
            RoomSettings settings) {
        this.code = code;
        this.name = name;
        this.createdBy = hostId;
        this.createdAt = createdAt;
        this.hostId = hostId;
        this.settings = settings;
        participants.put(hostId, RoomParticipant.human(hostId, hostDisplayName, createdAt));
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public UUID getHostId() {
        return hostId;
    }

    public String getHostDisplayName() {
        RoomParticipant host = participantForUser(hostId);
        return host == null ? null : host.getDisplayName();
    }

    public RoomState getState() {
        return state;
    }

    public RoomSettings getSettings() {
        return settings;
    }

    void setSettings(RoomSettings settings) {
        this.settings = settings;
    }

    public List<RoomParticipant> getParticipants() {
        return List.copyOf(participants.values());
    }

    public int getParticipantCount() {
        return participants.size();
    }

    public int getHumanCount() {
        return (int) participants.values().stream().filter(participant -> !participant.isBot()).count();
    }

    public boolean isEmpty() {
        return participants.isEmpty();
    }

    public Instant getEmptySince() {
        return emptySince;
    }

    public RoomParticipant participant(UUID participantId) {
        return participants.get(participantId);
    }

    public RoomParticipant participantForUser(UUID userId) {
        return participants.values().stream()
                .filter(participant -> userId.equals(participant.getUserId()))
                .findFirst()
                .orElse(null);
    }

    boolean containsUser(UUID userId) {
        return participantForUser(userId) != null;
    }

    boolean isFull() {
        return participants.size() >= settings.gridSize();
    }

    void addHuman(UUID userId, Instant joinedAt) {
        addHuman(userId, userId.toString(), joinedAt);
    }

    void addHuman(UUID userId, String displayName, Instant joinedAt) {
        if (containsUser(userId)) {
            participantForUser(userId).markConnected();
            return;
        }
        participants.put(userId, RoomParticipant.human(userId, displayName, joinedAt));
        emptySince = null;
    }

    RoomParticipant addBot(Instant joinedAt) {
        RoomParticipant bot = RoomParticipant.bot(joinedAt);
        bot.setReady(true);
        participants.put(bot.getId(), bot);
        return bot;
    }

    RoomParticipant remove(UUID participantId, Instant now) {
        RoomParticipant removed = participants.remove(participantId);
        if (participants.isEmpty()) {
            emptySince = now;
        }
        if (removed != null && participantId.equals(hostId)) {
            transferHost();
        }
        return removed;
    }

    void markDisconnected(UUID userId, Instant at) {
        RoomParticipant participant = participantForUser(userId);
        if (participant != null) {
            participant.markDisconnected(at);
        }
    }

    void markConnected(UUID userId) {
        RoomParticipant participant = participantForUser(userId);
        if (participant != null) {
            participant.markConnected();
        }
    }

    void ready(UUID userId, boolean value) {
        RoomParticipant participant = participantForUser(userId);
        if (participant != null) {
            participant.setReady(value);
        }
    }

    void setColor(UUID userId, String color) {
        RoomParticipant participant = participantForUser(userId);
        if (participant != null) {
            participant.setColor(color);
        }
    }

    boolean allNonHostHumansReady() {
        return participants.values().stream()
                .filter(participant -> !participant.isBot())
                .filter(participant -> !participant.getUserId().equals(hostId))
                .allMatch(RoomParticipant::isReady);
    }

    boolean hasMinimumGrid() {
        return participants.size() >= RoomSettings.MIN_GRID_SIZE;
    }

    void fillWithBotsIfEnabled(Instant now) {
        if (!settings.botsEnabled()) {
            return;
        }
        while (participants.size() < settings.gridSize()) {
            addBot(now);
        }
    }

    void removeBots(Instant now) {
        participants.values().stream()
                .filter(RoomParticipant::isBot)
                .map(RoomParticipant::getId)
                .toList()
                .forEach(participantId -> remove(participantId, now));
    }

    void start() {
        state = RoomState.QUALIFYING;
        drivingStarted = false;
        settings = settings.lock();
    }

    void markDrivingStarted() {
        drivingStarted = true;
    }

    boolean hasDrivingStarted() {
        return drivingStarted;
    }

    void cancelQualification(Instant now) {
        removeBots(now);
        state = RoomState.LOBBY;
        drivingStarted = false;
        settings = settings.unlock();
    }

    void close() {
        state = RoomState.CLOSED;
    }

    UUID transferHost() {
        UUID previousHost = hostId;
        hostId = participants.values().stream()
                .filter(participant -> !participant.isBot())
                .filter(RoomParticipant::isConnected)
                .sorted(Comparator.comparing(RoomParticipant::getJoinedAt))
                .map(RoomParticipant::getUserId)
                .findFirst()
                .orElseGet(() -> participants.values().stream()
                        .filter(participant -> !participant.isBot())
                        .sorted(Comparator.comparing(RoomParticipant::getJoinedAt))
                        .map(RoomParticipant::getUserId)
                        .findFirst()
                        .orElse(null));
        return previousHost;
    }

    boolean isExpired(Instant now) {
        return emptySince != null && Duration.between(emptySince, now).compareTo(Duration.ofMinutes(10)) >= 0;
    }

    void updateEmptySince(Instant now) {
        if (participants.isEmpty() && emptySince == null) {
            emptySince = now;
        } else if (!participants.isEmpty()) {
            emptySince = null;
        }
    }

    Map<UUID, RoomParticipant> participantMap() {
        return participants;
    }
}
