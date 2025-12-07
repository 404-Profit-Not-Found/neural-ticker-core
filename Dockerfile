# Base image
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies (only dev needed for build, but we prune later)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build
RUN ls -R dist

# --- Production Stage ---
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built assets
COPY --from=builder /app/dist ./dist

# Create a non-root user for security (optional but recommended for Cloud Run)
# Alpine images usually have 'node' user
USER node

# Expose port (Cloud Run sets PORT env var)
EXPOSE 8080

# Start command
CMD ["node", "dist/main"]
