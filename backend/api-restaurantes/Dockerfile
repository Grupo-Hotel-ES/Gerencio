FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY backend/tsconfig.json ./
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/packages/shared-db/package.json ./backend/packages/shared-db/
COPY backend/api-clientes/package.json ./backend/api-clientes/
COPY backend/api-pedidos/package.json ./backend/api-pedidos/
COPY backend/api-restaurantes/package.json ./backend/api-restaurantes/
COPY backend/api-credencial/package.json ./backend/api-credencial/

RUN pnpm install --frozen-lockfile

COPY backend/packages ./backend/packages
COPY backend/api-restaurantes ./backend/api-restaurantes

WORKDIR /app/backend/packages/shared-db
RUN pnpm exec prisma generate

WORKDIR /app/backend/api-restaurantes

ENV NODE_ENV=production
ENV PORT=3003
EXPOSE 3003

CMD ["pnpm", "start"]