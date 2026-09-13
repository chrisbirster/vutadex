# Deployment

## Build

The Docker image builds the Vite SPA first, copies `internal/web/dist` into a Go 1.26 build stage, then ships one non-root distroless binary.

## Fly

Attach `vutadex.com` and `game.vutadex.com` to the same Fly app initially. Configure a managed PostgreSQL connection as `DATABASE_URL` and secrets for auth/SES SMTP. Production refuses to start without PostgreSQL or an email sender.

Required secrets:

```text
DATABASE_URL
VUTADEX_AUTH_SECRET
VUTADEX_SMTP_ADDR
VUTADEX_SMTP_USERNAME
VUTADEX_SMTP_PASSWORD
VUTADEX_AUTH_FROM
```

The auth secret is reserved for future signing/key derivation and must still be long/random even though current opaque sessions are random tokens.

## AWS / SST

Run `pnpm infra:deploy`. SST creates the SES identity/DNS records. Request SES production sending access before expecting mail to arbitrary recipients. Generate SES SMTP credentials with least privilege and place them in Fly secrets; do not commit them.

## Database

Run Atlas plan then apply before deploying code that requires a new schema:

```bash
pnpm db:prod:plan
atlas schema apply --env production --auto-approve
```

Backups and a restore drill are required before public beta.
