# Use official Node.js LTS image
FROM node:20.12.2-slim

# Update package lists and upgrade system packages to fix vulnerabilities
RUN apt-get update && apt-get upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . .

# Healthcheck for process liveness (optional)
HEALTHCHECK CMD pgrep node || exit 1

CMD ["node", "app.js"]