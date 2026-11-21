ALTER TYPE "StatusPedido" ADD VALUE 'em_verificacao';

ALTER TABLE "Pedido"
  ADD COLUMN "chave_verificacao" UUID,
  ADD COLUMN "versao_verificacao" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Pedido_chave_verificacao_key" ON "Pedido"("chave_verificacao");

CREATE TABLE "VerificacaoCaixa" (
  "chave" UUID PRIMARY KEY,
  "usada" BOOLEAN NOT NULL DEFAULT false
);
