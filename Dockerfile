FROM node:24-alpine AS web
WORKDIR /src
RUN corepack enable
COPY package.json ./
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm build:web

FROM golang:1.26-alpine AS server
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
COPY --from=web /src/internal/web/dist ./internal/web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/vutadex ./cmd/vutadex

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=server /out/vutadex /vutadex
EXPOSE 8080
ENV PORT=8080
ENV VUTADEX_ENV=production
ENTRYPOINT ["/vutadex"]
