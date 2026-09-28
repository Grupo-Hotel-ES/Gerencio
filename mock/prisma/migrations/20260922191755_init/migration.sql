-- CreateEnum
CREATE TYPE "plataforma" AS ENUM ('IFOOD', 'NOVENTA_NOVE_FOOD', 'KEETA', 'UBER_EATS', 'RAPPI');

-- CreateEnum
CREATE TYPE "tipo_pedido" AS ENUM ('ENTREGA', 'RETIRADA');

-- CreateEnum
CREATE TYPE "entregue_por" AS ENUM ('PLATAFORMA', 'LOJA');

-- CreateEnum
CREATE TYPE "canal_evento" AS ENUM ('WEBHOOK', 'POLLING');

-- CreateTable
CREATE TABLE "pedidos" (
    "id" UUID NOT NULL,
    "plataforma" "plataforma" NOT NULL,
    "id_externo" TEXT NOT NULL,
    "codigo_exibicao" TEXT NOT NULL,
    "loja_id_externo" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tipo" "tipo_pedido" NOT NULL,
    "agendado_para" TIMESTAMPTZ(3),
    "entregue_por" "entregue_por" NOT NULL,
    "cliente" JSONB NOT NULL,
    "endereco" JSONB,
    "itens" JSONB NOT NULL,
    "subtotal_centavos" INTEGER NOT NULL,
    "taxa_entrega_centavos" INTEGER NOT NULL DEFAULT 0,
    "desconto_plataforma_centavos" INTEGER NOT NULL DEFAULT 0,
    "desconto_loja_centavos" INTEGER NOT NULL DEFAULT 0,
    "total_centavos" INTEGER NOT NULL,
    "pagamento" JSONB NOT NULL,
    "observacao" TEXT,
    "codigo_coleta" TEXT,
    "prazo_aceite_em" TIMESTAMPTZ(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "plataforma" "plataforma" NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "canal" "canal_evento" NOT NULL,
    "ack_em" TIMESTAMPTZ(3),
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimo_status_http" INTEGER,
    "proxima_tentativa_em" TIMESTAMPTZ(3),
    "duplicado_de" UUID,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pedidos_plataforma_status_idx" ON "pedidos"("plataforma", "status");

-- CreateIndex
CREATE INDEX "pedidos_plataforma_loja_id_externo_idx" ON "pedidos"("plataforma", "loja_id_externo");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_plataforma_id_externo_key" ON "pedidos"("plataforma", "id_externo");

-- CreateIndex
CREATE INDEX "eventos_plataforma_canal_ack_em_idx" ON "eventos"("plataforma", "canal", "ack_em");

-- CreateIndex
CREATE INDEX "eventos_pedido_id_idx" ON "eventos"("pedido_id");

-- CreateIndex
CREATE INDEX "eventos_canal_proxima_tentativa_em_idx" ON "eventos"("canal", "proxima_tentativa_em");

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_duplicado_de_fkey" FOREIGN KEY ("duplicado_de") REFERENCES "eventos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
