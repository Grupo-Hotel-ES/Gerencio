-- Em migration separada: o Postgres não permite usar um valor de enum
-- na mesma transação em que ele foi adicionado.
-- AlterTable
ALTER TABLE "Pedido" ALTER COLUMN "status" SET DEFAULT 'novo';
