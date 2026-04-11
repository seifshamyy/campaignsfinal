FROM node:20-alpine AS builder

WORKDIR /app

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

# Install server-only deps (skip postinstall — no client dir needed here)
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/client/dist ./client/dist
COPY server ./server

RUN mkdir -p uploads

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node server/index.js"]
