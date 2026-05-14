FROM node:20-slim

WORKDIR /app

# Prisma needs OpenSSL
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install deps (including devDeps for nest build)
COPY package*.json ./
COPY prisma ./prisma

RUN npm ci --legacy-peer-deps --include=dev

# Generate Prisma client types before TypeScript compilation
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

EXPOSE 3000
