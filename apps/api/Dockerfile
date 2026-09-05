# ── deps ─────────────────────────────────────────────────────
# @node-rs/argon2 ships prebuilt binaries, so no C/C++ toolchain
# is required in the image.
FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/api/package.json ./apps/api/
COPY package.json ./
RUN npm install --prefix apps/api --omit=dev --no-audit --no-fund \
 && cp -R apps/api/node_modules /prod_modules
RUN npm install --prefix apps/api --no-audit --no-fund

# ── build ────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npx prisma generate && npm run build

# ── development ──────────────────────────────────────────────
FROM node:22-alpine AS development
WORKDIR /app/apps/api
ENV NODE_ENV=development
COPY --from=deps /app/apps/api/node_modules ./node_modules
COPY apps/api .
RUN npx prisma generate
EXPOSE 4000
CMD ["npm", "run", "start:dev"]

# ── production ───────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app/apps/api
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /prod_modules ./node_modules
COPY --from=build /app/apps/api/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/apps/api/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/prisma ./prisma
COPY apps/api/package.json ./
USER app
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
