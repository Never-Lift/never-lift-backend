package com.neverlift.backend.room;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.beans.factory.annotation.Autowired;

import com.neverlift.backend.error.ApiException;
import com.neverlift.backend.room.dto.ConnectionTicketResponse;
import com.neverlift.backend.room.dto.CreateRoomRequest;
import com.neverlift.backend.room.dto.JoinRoomRequest;
import com.neverlift.backend.room.dto.RoomResponse;
import com.neverlift.backend.room.dto.RoomSettingsRequest;
import com.neverlift.backend.track.TrackRepository;
import com.neverlift.backend.user.UserRepository;

/** Coordinates ephemeral rooms, tickets, lobby rules and abuse controls. */
@Service
public class RoomManager {

    private static final List<String> ALLOWED_COLORS = List.of("#a84448", "#365f82", "#3f704f");

    private static final Pattern ROOM_CODE = Pattern.compile("[0-9]{4}");
    private static final int MAX_JOIN_ATTEMPTS_PER_MINUTE = 5;
    private static final String GENERIC_JOIN_CODE = "room_join_failed";
    private static final String GENERIC_JOIN_MESSAGE = "Unable to join that room";

    private final PasswordEncoder passwordEncoder;
    private final TrackRepository trackRepository;
    private final UserRepository userRepository;
    private final Clock clock;
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, ConnectionTicket> tickets = new ConcurrentHashMap<>();
    private final Map<String, Deque<Instant>> joinAttempts = new ConcurrentHashMap<>();

    @Autowired
    public RoomManager(PasswordEncoder passwordEncoder, TrackRepository trackRepository, Clock clock,
            UserRepository userRepository) {
        this.passwordEncoder = passwordEncoder;
        this.trackRepository = trackRepository;
        this.clock = clock;
        this.userRepository = userRepository;
    }

    public RoomManager(PasswordEncoder passwordEncoder, TrackRepository trackRepository, Clock clock) {
        this(passwordEncoder, trackRepository, clock, null);
    }

    public RoomManager(PasswordEncoder passwordEncoder, Clock clock) {
        this(passwordEncoder, null, clock, null);
    }

    public RoomManager(PasswordEncoder passwordEncoder) {
        this(passwordEncoder, Clock.systemUTC());
    }

    @Transactional(readOnly = true)
    public synchronized RoomResponse create(UUID userId, CreateRoomRequest request) {
        requireUser(userId);
        String code = nextRoomCode();
        String name = request.name() == null || request.name().isBlank()
                ? "Room " + code
                : request.name().trim();
        String trackId = request.trackId() == null || request.trackId().isBlank()
                ? RoomSettings.DEFAULT_TRACK_ID
                : request.trackId().trim();
        validateTrack(trackId);
        int gridSize = request.gridSize() == null ? RoomSettings.DEFAULT_GRID_SIZE : request.gridSize();
        validateGridSize(gridSize);
        boolean botsEnabled = Boolean.TRUE.equals(request.botsEnabled());
        BotDifficulty botDifficulty = parseDifficulty(request.botDifficulty());
        RoomVisibility visibility = parseVisibility(request.visibility());
        String passwordHash = hashPassword(request.password());

        Room room = new Room(code, name, userId, displayName(userId), now(),
                new RoomSettings(trackId, RoomSettings.TRACK_CATALOG_VERSION,
                        RoomSettings.PHYSICS_CONTRACT_VERSION, gridSize, botsEnabled,
                        botDifficulty, visibility, false), passwordHash);
        rooms.put(code, room);
        return RoomResponse.from(room);
    }

    @Transactional(readOnly = true)
    public synchronized List<RoomResponse> listPublic() {
        cleanupExpiredRooms();
        return rooms.values().stream()
                .filter(room -> room.getState() == RoomState.LOBBY)
                .filter(room -> room.getSettings().visibility() == RoomVisibility.PUBLIC)
                .map(RoomResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public synchronized RoomResponse get(String roomCode) {
        return RoomResponse.from(requireRoom(roomCode));
    }

    public synchronized RoomResponse join(UUID userId, String roomCode, String password, String origin) {
        requireUser(userId);
        if (!recordJoinAttempt(userId, origin)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, GENERIC_JOIN_CODE, GENERIC_JOIN_MESSAGE);
        }
        String normalizedCode = normalizeCode(roomCode);
        Room room = rooms.get(normalizedCode);
        if (room == null || room.getState() != RoomState.LOBBY) {
            throw genericJoinFailure();
        }
        if (room.hasPassword() && !passwordEncoder.matches(password == null ? "" : password,
                room.getPasswordHash())) {
            throw genericJoinFailure();
        }
        if (!room.containsUser(userId) && room.isFull()) {
            throw genericJoinFailure();
        }
        room.addHuman(userId, displayName(userId), now());
        return RoomResponse.from(room);
    }

    public synchronized ConnectionTicketResponse issueTicket(UUID userId, String roomCode) {
        requireUser(userId);
        Room room = requireRoom(roomCode);
        if (room.getState() != RoomState.LOBBY || !room.containsUser(userId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "room_not_found", "Room does not exist");
        }
        Instant issuedAt = now();
        String value = UUID.randomUUID().toString().replace("-", "");
        ConnectionTicket ticket = new ConnectionTicket(value, userId, room.getCode(), issuedAt);
        tickets.put(value, ticket);
        return new ConnectionTicketResponse(value, room.getCode(), ticket.getExpiresAt());
    }

    /** Atomically consumes a ticket for a first WebSocket connection. */
    public synchronized ConnectionTicket consumeTicket(String value, UUID userId, String roomCode) {
        if (value == null || value.isBlank() || userId == null) {
            throw invalidTicket();
        }
        ConnectionTicket ticket = tickets.get(value);
        if (ticket == null || !userId.equals(ticket.getUserId())
                || !ticketMatchesRoom(ticket, roomCode)) {
            throw invalidTicket();
        }
        Room room = rooms.get(ticket.getRoomCode());
        RoomParticipant participant = room == null ? null : room.participantForUser(userId);
        Instant disconnectedAt = participant == null ? null : participant.getDisconnectedAt();
        Instant now = now();
        if (room == null || room.getState() == RoomState.CLOSED || !ticket.canConsume(now, disconnectedAt)) {
            throw invalidTicket();
        }
        ticket.consume();
        room.markConnected(userId);
        return ticket;
    }

    /** Used by the WebSocket handshake: the opaque ticket is the credential. */
    public synchronized ConnectionTicket consumeTicket(String value, String roomCode) {
        if (value == null || value.isBlank()) {
            throw invalidTicket();
        }
        ConnectionTicket ticket = tickets.get(value);
        if (ticket == null || !ticketMatchesRoom(ticket, roomCode)) {
            throw invalidTicket();
        }
        Room room = rooms.get(ticket.getRoomCode());
        RoomParticipant participant = room == null ? null : room.participantForUser(ticket.getUserId());
        Instant disconnectedAt = participant == null ? null : participant.getDisconnectedAt();
        Instant now = now();
        if (room == null || room.getState() == RoomState.CLOSED || !ticket.canConsume(now, disconnectedAt)) {
            throw invalidTicket();
        }
        ticket.consume();
        room.markConnected(ticket.getUserId());
        return ticket;
    }

    public synchronized RoomResponse updateSettings(UUID userId, String roomCode, RoomSettingsRequest request) {
        Room room = requireHost(userId, roomCode);
        requireLobby(room);
        RoomSettings current = room.getSettings();
        if (current.settingsLocked()) {
            throw settingsLocked();
        }
        String trackId = request.trackId() == null || request.trackId().isBlank()
                ? current.trackId() : request.trackId().trim();
        validateTrack(trackId);
        int gridSize = request.gridSize() == null ? current.gridSize() : request.gridSize();
        validateGridSize(gridSize);
        if (gridSize < room.getParticipantCount()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "grid_too_small", "Grid cannot be smaller than the room");
        }
        boolean botsEnabled = request.botsEnabled() == null ? current.botsEnabled() : request.botsEnabled();
        BotDifficulty difficulty = request.botDifficulty() == null
                ? current.botDifficulty() : parseDifficulty(request.botDifficulty());
        RoomVisibility visibility = request.visibility() == null
                ? current.visibility() : parseVisibility(request.visibility());
        String passwordHash = currentPasswordHash(room, request.password());
        room.setPasswordHash(passwordHash);
        room.setSettings(new RoomSettings(trackId, current.trackCatalogVersion(),
                current.physicsContractVersion(), gridSize, botsEnabled, difficulty, visibility, false));
        return RoomResponse.from(room);
    }

    public synchronized RoomResponse setReady(UUID userId, String roomCode, boolean ready) {
        Room room = requireParticipant(userId, roomCode);
        requireLobby(room);
        room.ready(userId, ready);
        return RoomResponse.from(room);
    }

    public synchronized RoomResponse setLoadoutColor(UUID userId, String roomCode, String color) {
        Room room = requireParticipant(userId, roomCode);
        requireLobby(room);
        String normalizedColor = color == null ? null : color.trim().toLowerCase(java.util.Locale.ROOT);
        if (normalizedColor == null || !ALLOWED_COLORS.contains(normalizedColor)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_loadout", "A valid color is required");
        }
        room.setColor(userId, normalizedColor);
        return RoomResponse.from(room);
    }

    /** Starts the qualification phase; no race simulation is performed in Part 3a. */
    public synchronized RoomResponse start(UUID userId, String roomCode) {
        Room room = requireHost(userId, roomCode);
        requireLobby(room);
        if (!room.allHumansReady()) {
            throw new ApiException(HttpStatus.CONFLICT, "players_not_ready", "All human players must be ready");
        }
        room.fillWithBotsIfEnabled(now());
        if (!room.hasMinimumGrid()) {
            throw new ApiException(HttpStatus.CONFLICT, "not_enough_players", "At least two cars are required");
        }
        room.start();
        return RoomResponse.from(room);
    }

    public synchronized RoomResponse remove(UUID hostId, String roomCode, UUID participantId) {
        Room room = requireHost(hostId, roomCode);
        requireLobby(room);
        if (hostId.equals(participantId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "host_cannot_be_removed", "Host must leave the room");
        }
        if (room.participant(participantId) == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "participant_not_found", "Participant does not exist");
        }
        room.remove(participantId, now());
        return RoomResponse.from(room);
    }

    public synchronized RoomResponse leave(UUID userId, String roomCode) {
        Room room = requireParticipant(userId, roomCode);
        requireLobby(room);
        room.remove(userId, now());
        return RoomResponse.from(room);
    }

    public synchronized RoomResponse close(UUID userId, String roomCode) {
        Room room = requireHost(userId, roomCode);
        requireLobby(room);
        room.close();
        RoomResponse response = RoomResponse.from(room);
        rooms.remove(room.getCode());
        return response;
    }

    public synchronized void markDisconnected(UUID userId, String roomCode) {
        Room room = rooms.get(normalizeCode(roomCode));
        if (room != null && room.containsUser(userId)) {
            room.markDisconnected(userId, now());
        }
    }

    public synchronized void markConnected(UUID userId, String roomCode) {
        Room room = requireParticipant(userId, roomCode);
        room.markConnected(userId);
    }

    @Scheduled(fixedRate = 60_000)
    public synchronized int cleanupExpiredRooms() {
        Instant now = now();
        rooms.values().forEach(room -> room.updateEmptySince(now));
        List<String> expired = rooms.values().stream()
                .filter(room -> room.isExpired(now))
                .map(Room::getCode)
                .toList();
        expired.forEach(rooms::remove);
        tickets.entrySet().removeIf(entry -> ticketCanBeDiscarded(entry.getValue(), now));
        return expired.size();
    }

    public int joinAttemptsRemaining(UUID userId, String origin) {
        synchronized (this) {
            String key = attemptKey(userId, origin);
            Deque<Instant> attempts = joinAttempts.get(key);
            prune(attempts, now());
            return Math.max(0, MAX_JOIN_ATTEMPTS_PER_MINUTE - (attempts == null ? 0 : attempts.size()));
        }
    }

    public int roomCount() {
        return rooms.size();
    }

    private boolean recordJoinAttempt(UUID userId, String origin) {
        Instant now = now();
        String key = attemptKey(userId, origin);
        Deque<Instant> attempts = joinAttempts.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        prune(attempts, now);
        if (attempts.size() >= MAX_JOIN_ATTEMPTS_PER_MINUTE) {
            return false;
        }
        attempts.addLast(now);
        return true;
    }

    private boolean ticketCanBeDiscarded(ConnectionTicket ticket, Instant now) {
        Room room = rooms.get(ticket.getRoomCode());
        if (room == null) {
            return true;
        }
        RoomParticipant participant = room.participantForUser(ticket.getUserId());
        if (!ticket.isConsumed()) {
            return !ticket.getExpiresAt().isAfter(now);
        }
        if (participant == null || participant.isConnected()) {
            return true;
        }
        Instant disconnectedAt = participant.getDisconnectedAt();
        return disconnectedAt == null || !now.isBefore(disconnectedAt.plus(ConnectionTicket.RECONNECT_WINDOW));
    }

    private void prune(Deque<Instant> attempts, Instant now) {
        if (attempts == null) {
            return;
        }
        Instant cutoff = now.minusSeconds(60);
        while (!attempts.isEmpty() && !attempts.peekFirst().isAfter(cutoff)) {
            attempts.removeFirst();
        }
    }

    private String currentPasswordHash(Room room, String requestedPassword) {
        if (requestedPassword == null) {
            return room.getPasswordHash();
        }
        if (requestedPassword.isBlank()) {
            return null;
        }
        if (requestedPassword.length() < 6 || requestedPassword.length() > 100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_room_password",
                    "Room password must contain at least 6 characters");
        }
        return passwordEncoder.encode(requestedPassword);
    }

    private String hashPassword(String password) {
        if (password == null || password.isBlank()) {
            return null;
        }
        if (password.length() < 6 || password.length() > 100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_room_password",
                    "Room password must contain at least 6 characters");
        }
        return passwordEncoder.encode(password);
    }

    private void validateTrack(String trackId) {
        if (trackRepository != null && !trackRepository.existsById(trackId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "track_not_found", "Track is not in the active catalog");
        }
    }

    private String displayName(UUID userId) {
        if (userRepository == null) {
            return userId.toString();
        }
        return userRepository.findById(userId)
                .map(user -> user.getDisplayName() == null || user.getDisplayName().isBlank()
                        ? user.getGamertag() : user.getDisplayName())
                .orElse(userId.toString());
    }

    private static void validateGridSize(int gridSize) {
        if (gridSize < RoomSettings.MIN_GRID_SIZE || gridSize > RoomSettings.MAX_GRID_SIZE) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_grid_size", "Grid must be between 2 and 22 cars");
        }
    }

    private static BotDifficulty parseDifficulty(String value) {
        try {
            return BotDifficulty.from(value);
        } catch (IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_bot_difficulty", exception.getMessage());
        }
    }

    private static RoomVisibility parseVisibility(String value) {
        if (value == null || value.isBlank() || "public".equalsIgnoreCase(value)) {
            return RoomVisibility.PUBLIC;
        }
        if ("private".equalsIgnoreCase(value)) {
            return RoomVisibility.PRIVATE;
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_visibility", "Visibility must be public or private");
    }

    private String nextRoomCode() {
        for (int attempt = 0; attempt < 10000; attempt++) {
            String code = "%04d".formatted(ThreadLocalRandom.current().nextInt(10000));
            if (!rooms.containsKey(code)) {
                return code;
            }
        }
        throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "room_capacity_reached", "No room codes are available");
    }

    private Room requireRoom(String roomCode) {
        String normalized = normalizeCode(roomCode);
        Room room = rooms.get(normalized);
        if (room == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "room_not_found", "Room does not exist");
        }
        return room;
    }

    private Room requireParticipant(UUID userId, String roomCode) {
        requireUser(userId);
        Room room = requireRoom(roomCode);
        if (!room.containsUser(userId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "room_not_found", "Room does not exist");
        }
        return room;
    }

    private Room requireHost(UUID userId, String roomCode) {
        Room room = requireParticipant(userId, roomCode);
        if (!userId.equals(room.getHostId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "host_required", "Only the host may change the room");
        }
        return room;
    }

    private static void requireLobby(Room room) {
        if (room.getState() != RoomState.LOBBY) {
            throw new ApiException(HttpStatus.CONFLICT, "room_not_in_lobby", "This room is no longer in the lobby");
        }
    }

    private static void requireUser(UUID userId) {
        if (userId == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "authentication_required", "A valid user is required");
        }
    }

    private static String normalizeCode(String roomCode) {
        if (roomCode == null || !ROOM_CODE.matcher(roomCode.trim()).matches()) {
            throw genericJoinFailure();
        }
        return roomCode.trim();
    }

    private static boolean ticketMatchesRoom(ConnectionTicket ticket, String roomCode) {
        if (roomCode == null) {
            return true;
        }
        return ROOM_CODE.matcher(roomCode.trim()).matches()
                && ticket.getRoomCode().equals(roomCode.trim());
    }

    private static String attemptKey(UUID userId, String origin) {
        String normalizedOrigin = origin == null || origin.isBlank() ? "unknown" : origin.trim().toLowerCase();
        return userId + "|" + normalizedOrigin;
    }

    private Instant now() {
        return Instant.now(clock);
    }

    private static ApiException genericJoinFailure() {
        return new ApiException(HttpStatus.NOT_FOUND, GENERIC_JOIN_CODE, GENERIC_JOIN_MESSAGE);
    }

    private static ApiException invalidTicket() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "invalid_connection_ticket", "Connection ticket is invalid or expired");
    }

    private static ApiException settingsLocked() {
        return new ApiException(HttpStatus.CONFLICT, "room_settings_locked", "Room settings are locked");
    }
}
