# --- Stage 1: Build the previous web client (kept as a rollback: FRONTEND_LEGACY=true) ---
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
# Copy frontend package files
COPY frontend/package*.json ./
# Install frontend deps
ENV CYPRESS_INSTALL_BINARY=0
RUN npm ci
# Copy frontend source
COPY frontend/ .
# Build frontend
RUN npm run build

# --- Stage 1b: Build the web client served at / (frontend-v2) ---
FROM node:22-alpine AS frontend-v2-builder
WORKDIR /app/frontend-v2
COPY frontend-v2/package*.json ./
RUN npm ci
COPY frontend-v2/ .
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

ENV PORT=8080

WORKDIR /app

# Install curl — required by stocktwits.service.ts execFileSync fallback when
# Cloudflare blocks Axios (403). Alpine ships without curl by default, so
# without this the fallback silently fails with ENOENT in prod.
RUN apk add --no-cache curl

# Copy backend package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built backend assets
COPY --from=backend-builder /app/dist ./dist

# Previous client: served instead of the default only when FRONTEND_LEGACY=true
COPY --from=frontend-builder /app/client ./client

# Default client: app.module.ts serves <dist>/../frontend-v2/dist at /
COPY --from=frontend-v2-builder /app/frontend-v2/dist ./frontend-v2/dist

# Create a non-root user for security (optional but recommended for Cloud Run)
# Alpine images usually have 'node' user
USER node

# Expose port (Cloud Run sets PORT env var)
EXPOSE 8080

# Start command
CMD ["node", "dist/main"]
