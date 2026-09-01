package com.neverlift.backend.room;

import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

@Configuration
@EnableWebSocket
public class RoomWebSocketConfiguration implements WebSocketConfigurer {

    private final RoomWebSocketHandler roomWebSocketHandler;
    private final RoomManager roomManager;
    private final List<String> allowedOrigins;

    public RoomWebSocketConfiguration(
            RoomWebSocketHandler roomWebSocketHandler,
            RoomManager roomManager,
            @Value("${app.cors.allowed-origins}") String configuredAllowedOrigins) {
        this.roomWebSocketHandler = roomWebSocketHandler;
        this.roomManager = roomManager;
        this.allowedOrigins = Arrays.stream(configuredAllowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isBlank())
                .distinct()
                .toList();
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(roomWebSocketHandler, "/ws")
                .addInterceptors(new TicketHandshakeInterceptor(roomManager))
                .setAllowedOrigins(allowedOrigins.toArray(String[]::new));
    }

    static final class TicketHandshakeInterceptor implements HandshakeInterceptor {
        private final RoomManager roomManager;

        TicketHandshakeInterceptor(RoomManager roomManager) {
            this.roomManager = roomManager;
        }

        @Override
        public boolean beforeHandshake(
                ServerHttpRequest request,
                ServerHttpResponse response,
                WebSocketHandler wsHandler,
                java.util.Map<String, Object> attributes) {
            String ticketValue = UriComponentsBuilder.fromUri(request.getURI())
                    .build().getQueryParams().getFirst("ticket");
            if (ticketValue == null || ticketValue.isBlank()) {
                return false;
            }
            try {
                ConnectionTicket ticket = roomManager.consumeTicket(ticketValue, null);
                attributes.put(RoomWebSocketHandler.TICKET_ATTRIBUTE, ticket);
                attributes.put(RoomWebSocketHandler.USER_ID_ATTRIBUTE, ticket.getUserId());
                attributes.put(RoomWebSocketHandler.ROOM_CODE_ATTRIBUTE, ticket.getRoomCode());
                return true;
            } catch (RuntimeException exception) {
                return false;
            }
        }

        @Override
        public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                WebSocketHandler wsHandler, Exception exception) {
        }
    }
}
