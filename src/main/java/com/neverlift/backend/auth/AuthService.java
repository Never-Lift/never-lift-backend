package com.neverlift.backend.auth;

import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.neverlift.backend.auth.dto.LoginRequest;
import com.neverlift.backend.auth.dto.RegisterRequest;
import com.neverlift.backend.auth.dto.TokenResponse;
import com.neverlift.backend.error.ApiException;
import com.neverlift.backend.security.UserRole;
import com.neverlift.backend.user.User;
import com.neverlift.backend.user.UserRepository;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public TokenResponse register(RegisterRequest request) {
        if (userRepository.existsByGamertag(request.gamertag())) {
            throw duplicateGamertag();
        }

        User user = new User(
                request.gamertag(),
                request.displayName(),
                passwordEncoder.encode(request.password()));
        try {
            userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException exception) {
            throw duplicateGamertag();
        }
        return TokenResponse.from(jwtService.issue(user.getId(), UserRole.USER));
    }

    @Transactional(readOnly = true)
    public TokenResponse login(LoginRequest request) {
        User user = userRepository.findByGamertag(request.gamertag())
                .orElseThrow(this::invalidCredentials);
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw invalidCredentials();
        }
        return TokenResponse.from(jwtService.issue(user.getId(), UserRole.USER));
    }

    public TokenResponse guest() {
        return TokenResponse.from(jwtService.issue(UUID.randomUUID(), UserRole.GUEST));
    }

    private ApiException duplicateGamertag() {
        return new ApiException(HttpStatus.CONFLICT, "gamertag_taken", "Gamertag is already in use");
    }

    private ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "Gamertag or password is invalid");
    }
}
