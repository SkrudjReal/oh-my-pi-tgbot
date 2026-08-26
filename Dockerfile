FROM oven/bun:1.3.14-debian

ENV BUN_INSTALL=/usr/local

WORKDIR /app

# Install system utilities needed by agent (git, curl, ripgrep, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    ripgrep \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install OMP agent CLI globally
RUN bun add -g @oh-my-pi/pi-coding-agent@18.0.6

# Copy package configurations
COPY package.json bun.lock tsconfig.json ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy runtime source with non-root ownership
COPY --chown=bun:bun src ./src

ENV NODE_ENV=production
ENV HOME=/home/bun
ENV OMP_WORKSPACE_ROOT=/home/bun/.omp/telegram-workspaces
ENV OMP_SESSION_ROOT=/home/bun/.omp/telegram-sessions

RUN mkdir -p /home/bun/.omp/telegram-workspaces /home/bun/.omp/telegram-sessions \
    && chown -R bun:bun /home/bun/.omp /app

USER bun

CMD ["bun", "run", "src/index.ts"]
