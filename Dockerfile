# --- Stage 1: Build Frontend ---
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
# Copy frontend package files
COPY frontend/package*.json ./
# Install frontend deps
RUN npm ci
# Copy frontend source
COPY frontend/ .
# Build frontend
RUN npm run build

# --- Stage 2: Build Backend ---
FROM node:22-alpine AS backend-builder
WORKDIR /app
# Copy backend package files
COPY package*.json ./
# Install backend deps
RUN npm ci
# Copy backend source
COPY . .
# Build backend
RUN npm run build

# --- Stage 3: Production ---
FROM node:22-alpine

WORKDIR /app

# Copy backend package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built backend assets
COPY --from=backend-builder /app/dist ./dist

# Copy built frontend assets to the "client" folder expected by ServeStaticModule
COPY --from=frontend-builder /app/frontend/dist ./client

# Create a non-root user for security (optional but recommended for Cloud Run)
# Alpine images usually have 'node' user
USER node

# Expose port (Cloud Run sets PORT env var)
EXPOSE 8080

# Start command
CMD ["node", "dist/src/main"]
