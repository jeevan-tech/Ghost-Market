# Dockerfile for Google Cloud Run
# Packages both Next.js dashboard and Python Playwright engine

# 1. Base Debian Slim Image (perfect for setting up custom Node + Python Playwright)
FROM debian:bookworm-slim

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install core utilities and Python
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    python3-pip \
    python3-venv \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js v20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the repository structure
COPY package.json .gitignore README.md ./
COPY dashboard ./dashboard
COPY engine ./engine

# Set up Python virtual environment, upgrade pip, install dependencies, and setup Playwright
WORKDIR /app/engine
RUN python3 -m venv venv \
    && ./venv/bin/pip install --upgrade pip \
    && ./venv/bin/pip install --only-binary :all: -r requirements.txt \
    && ./venv/bin/playwright install-deps chromium \
    && ./venv/bin/playwright install chromium

# Set up Next.js environment and build the application
WORKDIR /app/dashboard
RUN npm install \
    && npm run build

# Cloud Run dynamically assigns a PORT environment variable (defaulting to 8080)
EXPOSE 8080

# Run Next.js server on the container start, dynamically reading the port variable
CMD ["sh", "-c", "npm run start -- -p ${PORT:-8080}"]
