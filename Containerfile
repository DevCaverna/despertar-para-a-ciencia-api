FROM node:24.21.0-alpine@sha256:be80f76cf40ec8e42b9bec49f60a55e0660f30af58d3e5a25530785b30ea67e2 AS base

WORKDIR /app

RUN corepack enable

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder

COPY nest-cli.json prisma.config.ts tsconfig.build.json tsconfig.json ./
COPY src ./src
RUN pnpm prisma contract emit
RUN pnpm run build

FROM deps AS runtime-deps

RUN pnpm prune --prod

FROM node:24.21.0-alpine@sha256:be80f76cf40ec8e42b9bec49f60a55e0660f30af58d3e5a25530785b30ea67e2 AS runner

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY --chown=app:app --from=builder /app/dist ./dist
COPY --chown=app:app --from=runtime-deps /app/node_modules ./node_modules
COPY --chown=app:app --from=builder /app/src/prisma ./src/prisma
COPY --chown=app:app migrations ./migrations
COPY --chown=app:app prisma.config.ts package.json ./
COPY --chown=app:app scripts/validate-deployment-env.mjs ./scripts/validate-deployment-env.mjs

EXPOSE 3000

USER app

CMD ["node", "--import", "./dist/instrumentation.js", "dist/main.js"]
