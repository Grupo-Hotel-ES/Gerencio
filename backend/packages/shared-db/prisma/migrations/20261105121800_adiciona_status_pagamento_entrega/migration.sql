-- CreateEnum: status de pagamento do repasse ao motoboy
CREATE TYPE "StatusPagamentoEntrega" AS ENUM ('pendente', 'pago');

-- AlterTable: adiciona percentual configurável de repasse da taxa de entrega ao motoboy no Restaurante (padrão 100%)
ALTER TABLE "Restaurante"
ADD COLUMN "percentual_repasse_motoboy" DOUBLE PRECISION NOT NULL DEFAULT 100.0;

-- AlterTable: adiciona valor do motoboy e controle de pagamento na Entrega
ALTER TABLE "Entrega"
ADD COLUMN "valor_motoboy" DECIMAL(10,2),
ADD COLUMN "status_pagamento" "StatusPagamentoEntrega" NOT NULL DEFAULT 'pendente',
ADD COLUMN "pago_em" TIMESTAMP(3);

-- CreateIndex: otimiza consulta de entregas por motoboy e período
CREATE INDEX "Entrega_entregador_id_data_hora_idx" ON "Entrega"("entregador_id", "data_hora");
