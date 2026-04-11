FROM node:20-alpine AS builder

WORKDIR /app

# Install root deps (server)
COPY package*.json ./
RUN npm ci

# Install and build client
COPY client/package*.json ./client/
RUN cd client && npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ---- Production image ----
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/client/dist ./client/dist
COPY server ./server

RUN mkdir -p uploads

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node server/index.js"]
