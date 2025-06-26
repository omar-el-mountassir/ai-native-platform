# AI-Native Platform Container
# Autonomous development environment with Claude Code and MCP servers

FROM ubuntu:22.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Set working directory
WORKDIR /workspace

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    python3 \
    python3-pip \
    nodejs \
    npm \
    docker.io \
    kubectl \
    jq \
    vim \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Install latest Node.js (20.x)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - \
    && apt-get install -y nodejs

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Go
RUN curl -L https://go.dev/dl/go1.21.6.linux-amd64.tar.gz | tar -C /usr/local -xz
ENV PATH="/usr/local/go/bin:${PATH}"

# Install Claude Code (when available publicly)
# Note: This will need to be updated when Claude Code has a public installation method
# For now, we'll create a placeholder script
RUN mkdir -p /usr/local/bin
COPY scripts/claude-code-placeholder.sh /usr/local/bin/claude-code
RUN chmod +x /usr/local/bin/claude-code

# Install Python development tools
RUN pip3 install --upgrade pip setuptools wheel
RUN pip3 install \
    fastapi \
    uvicorn \
    pydantic \
    sqlalchemy \
    pytest \
    black \
    flake8

# Install global npm packages
RUN npm install -g \
    typescript \
    @types/node \
    ts-node \
    nodemon \
    eslint \
    prettier \
    jest \
    turbo

# Create workspace structure
RUN mkdir -p /workspace/{mcps,projects,config,scripts,logs}

# Copy MCP servers and configuration
COPY mcps/ /workspace/mcps/
COPY config/ /workspace/config/
COPY scripts/ /workspace/scripts/

# Install MCP dependencies
RUN cd /workspace/mcps && npm install

# Make scripts executable
RUN chmod +x /workspace/scripts/*.sh

# Set up Claude Code configuration
RUN mkdir -p /root/.claude
COPY config/claude-config.json /root/.claude/config.json

# Create non-root user for development
RUN useradd -m -s /bin/bash developer && \
    echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers && \
    usermod -aG docker developer

# Set up environment for development user
USER developer
WORKDIR /home/developer

# Copy workspace to user directory
RUN sudo cp -r /workspace /home/developer/ && \
    sudo chown -R developer:developer /home/developer/workspace

# Set environment variables
ENV NODE_ENV=development
ENV PYTHONPATH=/home/developer/workspace
ENV PATH="/home/developer/workspace/scripts:${PATH}"

# Expose common development ports
EXPOSE 3000 8000 5000 8080 9000

# Start MCP servers and Claude Code
CMD ["/home/developer/workspace/scripts/start-platform.sh"]
