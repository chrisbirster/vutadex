# Authentication

VutaDex is passwordless.

1. User submits an email.
2. Server creates 256 random bits.
3. Only SHA-256(token) is persisted.
4. Challenge expires after 10 minutes and is one-use.
5. SES sends `game.vutadex.com/login/verify?token=...`.
6. The landing page requires an explicit confirmation click so automated email scanners do not consume the challenge.
7. Verification upserts the user and creates a 30-day opaque session.
8. Only the session hash is persisted; the raw token lives in an HttpOnly, Secure, SameSite=Lax host-only cookie.

Development may log links only when `VUTADEX_AUTH_LOG_LINKS=1`; production rejects that setting.

## SES

SST owns the `vutadex.com` SES identity, DKIM and `mail.vutadex.com` MAIL FROM records. The first deployment must request SES production sending access. The Go sender currently speaks SES SMTP; the sender boundary allows migration to the SES API/OIDC without touching authentication rules.

Add production rate limiting, bounce/complaint suppression and abuse telemetry before public beta.
