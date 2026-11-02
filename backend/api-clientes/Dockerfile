FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl && corepack enable

# Manifests primeiro: mantém a camada de dependências em cache entre builds.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/shared-db/package.json ./packages/shared-db/
COPY api-clientes/package.json ./api-clientes/
COPY api-pedidos/package.json ./api-pedidos/
COPY api-restaurantes/package.json ./api-restaurantes/

RUN pnpm install --frozen-lockfile

# Código: o serviço e o pacote compartilhado de acesso ao banco.
COPY packages ./packages
COPY api-clientes ./api-clientes

RUN pnpm db:generate

WORKDIR /app/api-clientes

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["pnpm", "start"]
