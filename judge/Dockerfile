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

# Install runtime dependencies and compilers.
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    gcc \
    g++ \
    python3 \
    nodejs \
    openjdk-17-jdk-headless \
    golang-go \
    libicu72 \
    libcap-dev \
    locales \
    && rm -rf /var/lib/apt/lists/*

# Install .NET 10 SDK (for C#).
# NOTE: dotnet's assembly lazy-loader is incompatible with isolate's namespace
# setup — MSBuild/csc fail to load System.Private.Xml etc. inside the sandbox.
# So the judge compiles C# *outside* isolate (see compile_on_host in
# engine/compiler/mod.rs); only the built DLL runs inside isolate at execute
# time. The judge container itself is the security boundary; the csproj
# template below locks down analyzers and NuGet sources so user submissions
# can't execute arbitrary code at compile time.
RUN curl -sSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \
    && chmod +x /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --channel 10.0 --install-dir /usr/share/dotnet \
    && ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet \
    && rm /tmp/dotnet-install.sh

ENV DOTNET_ROOT=/usr/share/dotnet \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1

# C# project template (staged into work_dir at compile time by aoj-cs-compile).
COPY files/csharp-template/Main.csproj /usr/share/aoj-csharp-template/Main.csproj
COPY files/csharp-template/NuGet.Config /usr/share/aoj-csharp-template/NuGet.Config

# C# compile wrapper (runs on host, not in isolate).
COPY files/aoj-cs-compile /usr/local/bin/aoj-cs-compile
RUN chmod +x /usr/local/bin/aoj-cs-compile

# Install Rust toolchain (rustc + std only, exclude build cache and sources)
COPY --from=builder /usr/local/cargo/bin/rustc /usr/local/cargo/bin/rustc
COPY --from=builder /usr/local/rustup/toolchains/1.91.1-x86_64-unknown-linux-gnu/bin /usr/local/rustup/toolchains/1.91.1-x86_64-unknown-linux-gnu/bin
COPY --from=builder /usr/local/rustup/toolchains/1.91.1-x86_64-unknown-linux-gnu/lib /usr/local/rustup/toolchains/1.91.1-x86_64-unknown-linux-gnu/lib
COPY --from=builder /usr/local/rustup/settings.toml /usr/local/rustup/settings.toml
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH="/usr/local/cargo/bin:$PATH"

# Set UTF-8 locale as default
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && \
    locale-gen en_US.UTF-8

ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8 \
    JAVA_TOOL_OPTIONS="-Dfile.encoding=UTF-8"

# Install isolate from source
RUN apt-get update && apt-get install -y git make libcap-dev pkg-config libsystemd-dev \
    && git clone --depth 1 --branch v2.3 https://github.com/ioi/isolate.git /tmp/isolate \
    && cd /tmp/isolate \
    && make install \
    && rm -rf /tmp/isolate \
    && rm -rf /var/lib/apt/lists/*

# isolate 2.3+ requires a dedicated 'isolate' user with subuid/subgid ranges
# for user-namespace sandboxing
RUN useradd --system --home-dir /var/local/lib/isolate --shell /usr/sbin/nologin isolate \
    && echo "isolate:100000:65536" >> /etc/subuid \
    && echo "isolate:100000:65536" >> /etc/subgid

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
