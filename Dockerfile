FROM node:20-alpine AS builder

WORKDIR /app

# OpenSSL required by Prisma
RUN apk add --no-cache openssl

# Install server deps (skip postinstall — client dir doesn't exist yet)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Install client deps
COPY client/package*.json ./client/
RUN cd client && npm ci

# Copy everything and build
COPY . .
RUN npx prisma generate
RUN cd client && npm run build

# ---- Production image ----
FROM node:20-alpine

WORKDIR /app

# OpenSSL required by Prisma
RUN apk add --no-cache openssl

# Install server-only deps (skip postinstall — no client dir needed here)
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/client/dist ./client/dist
COPY server ./server

RUN mkdir -p uploads

EXPOSE 3000

# db push syncs schema without needing migration files
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node server/index.js"]
