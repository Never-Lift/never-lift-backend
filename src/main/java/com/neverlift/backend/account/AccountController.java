package com.neverlift.backend.account;

import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.neverlift.backend.account.dto.AccountResponse;
import com.neverlift.backend.account.dto.DeleteAccountRequest;
import com.neverlift.backend.account.dto.UpdateAccountRequest;

@RestController
@RequestMapping("/api/account/me")
public class AccountController {

    private final AccountService accountService;

    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    @GetMapping
    public AccountResponse get(@AuthenticationPrincipal Jwt jwt) {
        return accountService.get(userId(jwt));
    }

    @PatchMapping
    public AccountResponse update(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody UpdateAccountRequest request) {
        return accountService.update(userId(jwt), request);
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody DeleteAccountRequest request) {
        accountService.delete(userId(jwt), request);
    }

    private UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
