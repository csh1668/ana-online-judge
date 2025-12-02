# Build stage
FROM rust:1.91-bookworm AS builder

WORKDIR /app

# Copy manifests
COPY Cargo.toml Cargo.lock* ./

# Create dummy main to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy actual source code
COPY src ./src

# Build the actual binary
RUN touch src/main.rs && cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies and compilers
RUN apt-get update && apt-get install -y \
    ca-certificates \
    gcc \
    g++ \
    python3 \
    openjdk-17-jdk-headless \
    libcap-dev \
    && rm -rf /var/lib/apt/lists/*

# Install isolate from source
RUN apt-get update && apt-get install -y git make libcap-dev pkg-config libsystemd-dev \
    && git clone https://github.com/ioi/isolate.git /tmp/isolate \
    && cd /tmp/isolate \
    && make install \
    && rm -rf /tmp/isolate \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the built binary
COPY --from=builder /app/target/release/judge /app/judge

# Copy configuration files
COPY languages.toml /app/languages.toml

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# isolate requires root privileges for cgroups
ENV RUST_LOG=info

# Create directories for isolate
RUN mkdir -p /var/local/lib/isolate /run/isolate

# Increase isolate num_boxes to support multiple workers
RUN sed -i 's/num_boxes = 1000/num_boxes = 10000/' /usr/local/etc/isolate

ENTRYPOINT ["/app/entrypoint.sh"]
