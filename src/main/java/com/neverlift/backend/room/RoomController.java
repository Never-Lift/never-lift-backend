package com.neverlift.backend.room;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.neverlift.backend.room.dto.ConnectionTicketResponse;
import com.neverlift.backend.room.dto.CreateRoomRequest;
import com.neverlift.backend.room.dto.LoadoutRequest;
import com.neverlift.backend.room.dto.RoomResponse;
import com.neverlift.backend.room.dto.RoomSettingsRequest;
import com.neverlift.backend.security.OnlineOnly;

@RestController
@RequestMapping("/api/rooms")
@OnlineOnly
public class RoomController {

    private final RoomManager roomManager;
    private final RoomWebSocketHandler roomWebSocketHandler;

    public RoomController(RoomManager roomManager, RoomWebSocketHandler roomWebSocketHandler) {
        this.roomManager = roomManager;
        this.roomWebSocketHandler = roomWebSocketHandler;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RoomResponse create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody(required = false) CreateRoomRequest request) {
        return roomManager.create(userId(jwt), request == null ? new CreateRoomRequest(
                null, null, null, null, null, null) : request);
    }

    @GetMapping
    public List<RoomResponse> listPublic() {
        return roomManager.listPublic();
    }

    @GetMapping("/{roomCode}")
    public RoomResponse get(@PathVariable String roomCode) {
        return roomManager.get(roomCode);
    }

    @PostMapping("/{roomCode}/join")
    public RoomResponse join(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomCode,
            @RequestHeader(value = HttpHeaders.ORIGIN, required = false) String origin) {
        RoomResponse response = roomManager.join(userId(jwt), roomCode, origin);
        roomWebSocketHandler.broadcastRoomState(roomCode);
        return response;
    }

    @PostMapping({"/{roomCode}/connection-ticket", "/{roomCode}/ticket"})
    @ResponseStatus(HttpStatus.CREATED)
    public ConnectionTicketResponse issueTicket(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomCode) {
        return roomManager.issueTicket(userId(jwt), roomCode);
    }

    @PostMapping("/connection-ticket")
    @ResponseStatus(HttpStatus.CREATED)
    public ConnectionTicketResponse issueTicketFromBody(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody TicketRequest request) {
        return roomManager.issueTicket(userId(jwt), request.roomCode());
    }

    @PatchMapping("/{roomCode}/settings")
    public RoomResponse updateSettings(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomCode,
            @Valid @RequestBody RoomSettingsRequest request) {
        RoomResponse response = roomManager.updateSettings(userId(jwt), roomCode, request);
        roomWebSocketHandler.broadcastRoomState(roomCode);
        return response;
    }

    @PostMapping("/{roomCode}/ready")
    public RoomResponse ready(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomCode,
            @RequestBody(required = false) ReadyRequest request) {
        RoomResponse response = roomManager.setReady(
                userId(jwt), roomCode, request == null || request.ready());
        roomWebSocketHandler.broadcastRoomState(roomCode);
        return response;
    }

    @PostMapping("/{roomCode}/loadout")
    public RoomResponse loadout(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomCode,
            @Valid @RequestBody LoadoutRequest request) {
        RoomResponse response = roomManager.setLoadoutColor(userId(jwt), roomCode, request.color());
        roomWebSocketHandler.broadcastRoomState(roomCode);
        return response;
    }

    @PostMapping("/{roomCode}/start")
    public RoomResponse start(@AuthenticationPrincipal Jwt jwt, @PathVariable String roomCode) {
        RoomResponse response = roomManager.start(userId(jwt), roomCode);
        roomWebSocketHandler.broadcastRoomState(roomCode);
        return response;
    }

    @PostMapping("/{roomCode}/cancel-qualification")
    public RoomResponse cancelQualification(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomCode) {
        RoomResponse response = roomManager.cancelQualification(userId(jwt), roomCode);
        roomWebSocketHandler.broadcastRoomState(roomCode);
        return response;
    }

    @DeleteMapping("/{roomCode}/participants/{participantId}")
    public RoomResponse remove(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomCode,
            @PathVariable UUID participantId) {
        RoomResponse response = roomManager.remove(userId(jwt), roomCode, participantId);
        roomWebSocketHandler.disconnectParticipant(
                roomCode, participantId, "removed_from_room", "Você foi removido da sala pelo host.");
        roomWebSocketHandler.broadcastRoomState(roomCode);
        return response;
    }

    @PostMapping("/{roomCode}/leave")
    public RoomResponse leave(@AuthenticationPrincipal Jwt jwt, @PathVariable String roomCode) {
        UUID leavingUserId = userId(jwt);
        RoomResponse response = roomManager.leave(leavingUserId, roomCode);
        roomWebSocketHandler.disconnectParticipant(
                roomCode, leavingUserId, "left_room", "Você saiu da sala.");
        if (response.participantCount() > 0) {
            roomWebSocketHandler.broadcastRoomState(roomCode);
        }
        return response;
    }

    @PostMapping("/{roomCode}/close")
    public RoomResponse close(@AuthenticationPrincipal Jwt jwt, @PathVariable String roomCode) {
        RoomResponse response = roomManager.close(userId(jwt), roomCode);
        roomWebSocketHandler.closeRoom(roomCode, "room_closed", "A sala foi encerrada pelo host.");
        return response;
    }

    private UUID userId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (RuntimeException exception) {
            throw new org.springframework.security.access.AccessDeniedException("A user identity is required");
        }
    }

    public record TicketRequest(String roomCode) {
    }

    public record ReadyRequest(boolean ready) {
    }
}
