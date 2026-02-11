# Build stage
FROM rust:1.91-bookworm AS builder

WORKDIR /app

# Copy manifests
COPY Cargo.toml Cargo.lock* ./

# Create dummy main to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy actual source code and files needed at compile time
COPY src ./src
COPY files ./files

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
    nodejs \
    openjdk-17-jdk-headless \
    libcap-dev \
    locales \
    && rm -rf /var/lib/apt/lists/*

# Set UTF-8 locale as default
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && \
    locale-gen en_US.UTF-8

ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8 \
    JAVA_TOOL_OPTIONS="-Dfile.encoding=UTF-8"

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

# Copy files
COPY files /app/files

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
