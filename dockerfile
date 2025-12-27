# Use official Node.js Alpine image (lightweight)
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first (for caching layers)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# We don't specify CMD here because we will use docker-compose 
# to run different commands (server, dispatcher, worker) from this same image.