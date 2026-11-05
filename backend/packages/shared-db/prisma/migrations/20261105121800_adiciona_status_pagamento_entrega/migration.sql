-- CreateEnum: status de pagamento do repasse ao motoboy
CREATE TYPE "StatusPagamentoEntrega" AS ENUM ('pendente', 'pago');

-- AlterTable: adiciona controle de pagamento na Entrega
ALTER TABLE "Entrega"
ADD COLUMN "status_pagamento" "StatusPagamentoEntrega" NOT NULL DEFAULT 'pendente',
ADD COLUMN "pago_em" TIMESTAMP(3);

-- CreateIndex: otimiza consulta de entregas por motoboy e período
CREATE INDEX "Entrega_entregador_id_data_hora_idx" ON "Entrega"("entregador_id", "data_hora");

