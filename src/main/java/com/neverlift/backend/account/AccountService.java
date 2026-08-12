package com.neverlift.backend.account;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.neverlift.backend.account.dto.AccountResponse;
import com.neverlift.backend.account.dto.DeleteAccountRequest;
import com.neverlift.backend.account.dto.UpdateAccountRequest;
import com.neverlift.backend.error.ApiException;
import com.neverlift.backend.user.User;
import com.neverlift.backend.user.UserRepository;

@Service
public class AccountService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AccountService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public AccountResponse get(UUID userId) {
        return AccountResponse.from(findUser(userId));
    }

    @Transactional
    public AccountResponse update(UUID userId, UpdateAccountRequest request) {
        User user = findUser(userId);
        verifyCurrentPassword(user, request.currentPassword());

        if (request.displayName() != null) {
            user.setDisplayName(request.displayName());
        }
        if (request.avatarId() != null) {
            user.setAvatarId(request.avatarId());
        }
        if (request.password() != null) {
            user.setPasswordHash(passwordEncoder.encode(request.password()));
        }
        return AccountResponse.from(user);
    }

    @Transactional
    public void delete(UUID userId, DeleteAccountRequest request) {
        User user = findUser(userId);
        verifyCurrentPassword(user, request.currentPassword());
        userRepository.delete(user);
    }

    private User findUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "account_not_found",
                        "Account no longer exists"));
    }

    private void verifyCurrentPassword(User user, String currentPassword) {
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "invalid_current_password",
                    "Current password is invalid");
        }
    }
}
