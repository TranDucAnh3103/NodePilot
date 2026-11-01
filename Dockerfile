# ==========================================
# Stage 1: Build Frontend Web SPA
# ==========================================
FROM node:22-alpine AS frontend-builder
WORKDIR /app/web

# Cache npm dependencies
COPY web/package.json web/package-lock.json ./
RUN npm ci

# Copy frontend source and build optimized distribution
COPY web/ ./
RUN npm run build

# ==========================================
# Stage 2: Build Static Go Binaries
# ==========================================
FROM golang:alpine AS go-builder
WORKDIR /app

# Disable CGO for pure-Go static compilation
ENV CGO_ENABLED=0 \
    GOOS=linux \
    GOARCH=amd64

# Cache Go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy source code and embedded frontend from Stage 1
COPY . .
COPY --from=frontend-builder /app/web/dist ./web/dist

# Build stripped, production-ready binaries
ARG VERSION=dev
ARG COMMIT=none
RUN go build -ldflags="-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" -o /build/hscc-api ./cmd/hscc-api && \
    go build -ldflags="-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" -o /build/hscc-cli ./cmd/hscc-cli

# ==========================================
# Stage 3: Minimal, Hardened Runtime Image
# ==========================================
FROM alpine:3.21 AS runtime

# Install root certs, timezone data and curl for health check
RUN apk add --no-cache ca-certificates tzdata curl && \
    addgroup -g 10001 -S hscc && \
    adduser -u 10001 -S hscc -G hscc -s /sbin/nologin && \
    mkdir -p /var/lib/hscc /etc/hscc /run/hscc && \
    chown -R hscc:hscc /var/lib/hscc /run/hscc

WORKDIR /var/lib/hscc

# Copy compiled binaries from Stage 2
COPY --from=go-builder --chown=hscc:hscc /build/hscc-api /usr/local/bin/hscc-api
COPY --from=go-builder --chown=hscc:hscc /build/hscc-cli /usr/local/bin/hscc-cli

# Default environment configuration
ENV HSCC_ADDR="0.0.0.0:17880" \
    HSCC_DB_PATH="/var/lib/hscc/hscc.db" \
    HSCC_LOG_LEVEL="INFO"

# Volume for SQLite WAL database persistence
VOLUME ["/var/lib/hscc"]

# Non-root execution
USER hscc:hscc

# Expose Web SPA and REST/WebSocket API port
EXPOSE 17880

# Healthcheck to probe server readiness
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://127.0.0.1:17880/ || exit 1

ENTRYPOINT ["/usr/local/bin/hscc-api"]
