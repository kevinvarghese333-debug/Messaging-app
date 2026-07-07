# ---- Build stage -----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage ----------------------------------------------------------
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production \
    DATABASE_URL="file:/data/teamcollab.db" \
    UPLOAD_DIR=/data/uploads \
    PORT=3000

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/prisma server/prisma
COPY --from=build /app/web/dist web/dist

EXPOSE 3000

# On boot: sync the schema into the (persistent) SQLite file, then serve.
CMD ["sh", "-c", "mkdir -p /data/uploads && cd server && npx prisma db push --skip-generate && node dist/index.js"]
