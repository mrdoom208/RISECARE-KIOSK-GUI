FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc tsconfig.base.json tsconfig.json ./

RUN mkdir -p artifacts/api-server artifacts/risecare-kiosk lib/api-client-react lib/api-zod lib/db lib/api-spec scripts
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/risecare-kiosk/package.json ./artifacts/risecare-kiosk/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY scripts/package.json ./scripts/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @workspace/risecare-kiosk run build
RUN pnpm --filter @workspace/api-server run build

EXPOSE 5000
ENV NODE_ENV=production
ENV PORT=5000
ENV SERVE_STATIC=true

CMD ["node", "artifacts/api-server/dist/index.cjs"]
