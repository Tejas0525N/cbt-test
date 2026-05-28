# Build stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
WORKDIR /app/server
RUN npm ci --only=production --no-audit --no-fund

# Expose ports
EXPOSE 3001

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV JWT_SECRET=change-this-in-production

# Start server
CMD ["node", "server-json.js"]
