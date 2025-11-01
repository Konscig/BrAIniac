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

# Start server; migrations are invoked via docker-compose command
CMD ["node", "dist/index.js"]
