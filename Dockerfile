FROM node:20-slim

# Set NODE_ENV to production
ENV NODE_ENV=production

# Update package lists and upgrade system packages to fix vulnerabilities
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user to run the app
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install dependencies as root (needed for some packages)
RUN npm ci --only=production && \
    npm cache clean --force

# Copy app source
COPY . .

# Create directory for state file with proper permissions
RUN mkdir -p /app/data && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Use volume for persistent state
VOLUME ["/app/data"]

CMD ["node", "app.js"]