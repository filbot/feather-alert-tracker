FROM node:20-slim

# Set NODE_ENV to production
ENV NODE_ENV=production

# Set timezone to America/Los_Angeles (PST/PDT)
ENV TZ=America/Los_Angeles

# Update package lists and upgrade system packages to fix vulnerabilities
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y tzdata && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy app source
COPY . .

# Create /storage directory for persistent state (Once convention)
RUN mkdir -p /storage

# Once expects persistent data in /storage
VOLUME ["/storage"]

# Once expects HTTP on port 80
EXPOSE 80

# Healthcheck via the /up endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost/up').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "app.js"]
