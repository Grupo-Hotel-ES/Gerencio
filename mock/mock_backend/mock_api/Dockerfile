# Imagem da API do mock. Build a partir de mock/ (ver docker-compose.yml).
FROM node:22-alpine

WORKDIR /app

RUN npm install -g pnpm@11.9.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma7.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY mock_backend ./mock_backend

EXPOSE 3333

# Aplica as migrations pendentes antes de subir a API
CMD ["sh", "-c", "pnpm exec prisma migrate deploy --config prisma7.config.ts && node mock_backend/mock_api/index.ts"]
