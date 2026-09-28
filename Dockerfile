# Base Node.js image
FROM node:22-alpine AS runner

WORKDIR /app

# Install security updates & curl for healthcheck
RUN apk --no-cache add curl

# Set production environment
ENV NODE_ENV=production
ENV PORT=4000

# Copy package descriptors
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy application source
COPY src ./src

# Create volume directory for persistent configuration & port registry
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/api/status || exit 1

CMD ["node", "src/server.js"]
