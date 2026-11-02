/*
  Warnings:

  - The primary key for the `ItemPedido` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `ItemPedido` table. All the data in the column will be lost.
  - The primary key for the `VinculoFuncionario` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `VinculoFuncionario` table. All the data in the column will be lost.
  - You are about to drop the `EstoqueProduto` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `restaurante_id` to the `Produto` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "EstoqueProduto" DROP CONSTRAINT "EstoqueProduto_produto_id_fkey";

-- DropForeignKey
ALTER TABLE "EstoqueProduto" DROP CONSTRAINT "EstoqueProduto_restaurante_id_fkey";

-- AlterTable
ALTER TABLE "ItemPedido" DROP CONSTRAINT "ItemPedido_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "ItemPedido_pkey" PRIMARY KEY ("pedido_id", "produto_id");

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "restaurante_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "VinculoFuncionario" DROP CONSTRAINT "VinculoFuncionario_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "VinculoFuncionario_pkey" PRIMARY KEY ("restaurante_id", "funcionario_id");

-- DropTable
DROP TABLE "EstoqueProduto";

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "Restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
