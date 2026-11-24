# syntax=docker/dockerfile:1
# FacturaLibre — imagen multi-objetivo: web | worker | migrate
#   docker build --target web    -t facturalibre-web .
#   docker build --target worker -t facturalibre-worker .
#   docker build --target migrate -t facturalibre-migrate .

ARG NODE_VERSION=22-alpine

# ─── Base con pnpm ────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS base
RUN npm install -g pnpm@10.34.9 && apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ─── Dependencias (capa cacheable: solo manifiestos) ──────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/auth/package.json packages/auth/
COPY packages/database/package.json packages/database/
COPY packages/domain/package.json packages/domain/
COPY packages/fiscal-core/package.json packages/fiscal-core/
COPY packages/verifactu/package.json packages/verifactu/
COPY packages/security/package.json packages/security/
COPY packages/tenancy/package.json packages/tenancy/
RUN pnpm install --frozen-lockfile

# ─── Compilación ──────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm --filter @facturalibre/database db:generate \
 && pnpm --filter @facturalibre/web build

# ─── Migraciones (se ejecuta una vez por despliegue con el rol propietario) ───
FROM build AS migrate
CMD ["pnpm", "db:migrate"]

# ─── Worker ───────────────────────────────────────────────────────────────────
# Fase 1: se ejecuta desde el árbol compilado con tsx. Optimizar tamaño de imagen en Fase 7.
FROM build AS worker
ENV NODE_ENV=production
USER node
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8081/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@facturalibre/worker", "start"]

# ─── Web (Next.js standalone, imagen mínima) ─────────────────────────────────
FROM node:${NODE_VERSION} AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
