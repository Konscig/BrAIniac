# Dockerfile for TypeScript/Node.js backend with Prisma
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npx tsc

# Expose port (change if needed)
EXPOSE 3000

# Copy entrypoint and make executable
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# ENTRYPOINT will run migrations (prisma migrate deploy) then start the app
ENTRYPOINT ["/app/entrypoint.sh"]
