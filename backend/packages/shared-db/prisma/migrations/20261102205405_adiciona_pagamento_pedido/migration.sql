-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('pendente', 'pago', 'expirado', 'falhou');

-- CreateTable
CREATE TABLE "PagamentoPedido" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "sessao_stripe_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "status" "StatusPagamento" NOT NULL DEFAULT 'pendente',
    "expira_em" TIMESTAMP(3) NOT NULL,
    "pago_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagamentoPedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PagamentoPedido_sessao_stripe_id_key" ON "PagamentoPedido"("sessao_stripe_id");

-- CreateIndex
CREATE INDEX "PagamentoPedido_pedido_id_status_idx" ON "PagamentoPedido"("pedido_id", "status");

-- AddForeignKey
ALTER TABLE "PagamentoPedido" ADD CONSTRAINT "PagamentoPedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
