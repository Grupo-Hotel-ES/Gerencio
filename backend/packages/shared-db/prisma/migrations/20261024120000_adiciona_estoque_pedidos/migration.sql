ALTER TABLE "Produto"
  ADD COLUMN "categoria" TEXT NOT NULL DEFAULT 'Sem categoria',
  ADD COLUMN "quantidade" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "versao_estoque" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Produto" ADD CONSTRAINT "Produto_quantidade_nao_negativa" CHECK ("quantidade" >= 0);

ALTER TABLE "Pedido"
  ADD COLUMN "restaurante_id" INTEGER,
  ADD COLUMN "estoque_baixado" BOOLEAN NOT NULL DEFAULT false;

-- Pedidos antigos com itens de um único restaurante podem ser associados com segurança.
-- Não há baixa retroativa: o saldo inicial deve ser informado pela operação.
UPDATE "Pedido" AS pedido
SET "restaurante_id" = origem.restaurante_id
FROM (
  SELECT item."pedido_id", MIN(produto."restaurante_id") AS restaurante_id
  FROM "ItemPedido" AS item
  JOIN "Produto" AS produto ON produto."id" = item."produto_id"
  GROUP BY item."pedido_id"
  HAVING COUNT(DISTINCT produto."restaurante_id") = 1
) AS origem
WHERE pedido."id" = origem."pedido_id";

CREATE INDEX "Pedido_restaurante_id_status_idx" ON "Pedido"("restaurante_id", "status");
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_restaurante_id_fkey"
  FOREIGN KEY ("restaurante_id") REFERENCES "Restaurante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
