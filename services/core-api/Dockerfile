# Build from the repository root:
#   docker build -f services/core-api/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
# argon2 compiles a native addon.
RUN apk add --no-cache python3 make g++
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY services/core-api/package.json ./services/core-api/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/core-api/ ./services/core-api/
RUN pnpm --filter "./packages/**" build \
 && pnpm --filter @nyanoghar/core-api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/core-api/dist ./services/core-api/dist
COPY --from=build /app/services/core-api/package.json ./services/core-api/
COPY --from=build /app/services/core-api/drizzle ./services/core-api/drizzle

USER node
EXPOSE 4000
CMD ["node", "services/core-api/dist/server.js"]
