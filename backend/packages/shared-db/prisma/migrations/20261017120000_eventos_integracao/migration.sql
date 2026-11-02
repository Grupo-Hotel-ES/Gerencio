-- Registro de entrada para notificações das plataformas de delivery.
CREATE TYPE "StatusEventoIntegracao" AS ENUM ('pendente', 'processando', 'processado', 'falhou', 'erro');

ALTER TABLE "Pedido" ADD COLUMN "pedido_externo_id" TEXT;

CREATE TABLE "EventoIntegracao" (
    "id" SERIAL NOT NULL,
    "plataforma" TEXT NOT NULL,
    "evento_id" TEXT NOT NULL,
    "pedido_id_externo" TEXT NOT NULL,
    "loja_id_externo" TEXT,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "StatusEventoIntegracao" NOT NULL DEFAULT 'pendente',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proxima_tentativa_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processamento_iniciado_em" TIMESTAMP(3),
    "ultimo_erro" TEXT,
    "processado_em" TIMESTAMP(3),
    "pedido_id" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventoIntegracao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Pedido_app_pedido_externo_id_key" ON "Pedido"("app", "pedido_externo_id");
CREATE UNIQUE INDEX "EventoIntegracao_plataforma_evento_id_key" ON "EventoIntegracao"("plataforma", "evento_id");
CREATE UNIQUE INDEX "EventoIntegracao_plataforma_pedido_id_externo_tipo_key" ON "EventoIntegracao"("plataforma", "pedido_id_externo", "tipo");
CREATE INDEX "EventoIntegracao_status_proxima_tentativa_em_idx" ON "EventoIntegracao"("status", "proxima_tentativa_em");

ALTER TABLE "EventoIntegracao" ADD CONSTRAINT "EventoIntegracao_pedido_id_fkey"
  FOREIGN KEY ("pedido_id") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
