FROM node:22-bookworm-slim AS builder

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.base.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/scan-core/package.json ./packages/scan-core/

RUN pnpm install --frozen-lockfile

COPY packages/api ./packages/api
COPY packages/scan-core ./packages/scan-core

RUN pnpm --filter @nutriscan/scan-core build

WORKDIR /app/packages/api
RUN pnpm exec prisma generate
RUN pnpm exec tsc --project prisma/tsconfig.seed.json --outDir dist-seed
RUN pnpm run build \
  && test -f dist/main.js
WORKDIR /app
RUN pnpm --filter @nutriscan/api deploy --legacy --prod /prod/api \
  && cd /prod/api \
  && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM node:22-bookworm-slim AS runner

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/corepack \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg \
    /opt/yarn*

WORKDIR /app

COPY --from=builder --chown=node:node /prod/api ./
COPY --from=builder --chown=node:node /app/packages/api/dist-seed ./dist-seed
COPY --chown=node:node packages/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production

EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Applies pending Prisma migrations before the server starts accepting
# traffic - the runner stage strips pnpm/npm/npx (see above), so this can't
# be a `prisma migrate deploy && node dist/main.js` string typed into
# Render's Start/Docker Command box: that field does not parse shell
# operators like `&&`, it passed the whole string as one literal token.
CMD ["./docker-entrypoint.sh"]
