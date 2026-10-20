-- AlterEnum
ALTER TYPE "StatusPedido" ADD VALUE 'novo' BEFORE 'em_preparo';
ALTER TYPE "StatusPedido" ADD VALUE 'pronto' AFTER 'em_preparo';

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
