-- O pedido deixa de guardar o nome do cliente em texto e passa a apontar para Cliente.
-- Antes de remover a coluna, cada par (nome, endereço) dos pedidos sem cliente vira
-- um cliente (ou reaproveita um já cadastrado com o mesmo nome e endereço).

-- Cria os clientes que faltam (sem diferenciar maiúsculas de minúsculas)
INSERT INTO "Cliente" ("nome_cliente", "endereco")
SELECT DISTINCT ON (lower(trim(p."nome_cliente")), lower(trim(p."endereco_destino")))
  trim(p."nome_cliente"), trim(p."endereco_destino")
FROM "Pedido" p
WHERE p."cliente_id" IS NULL
  AND trim(coalesce(p."nome_cliente", '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "Cliente" c
    WHERE lower(trim(c."nome_cliente")) = lower(trim(p."nome_cliente"))
      AND lower(trim(c."endereco")) = lower(trim(p."endereco_destino"))
  )
ORDER BY lower(trim(p."nome_cliente")), lower(trim(p."endereco_destino")), p."id";

-- Liga cada pedido ao cliente correspondente
UPDATE "Pedido" p
SET "cliente_id" = (
  SELECT c."id" FROM "Cliente" c
  WHERE lower(trim(c."nome_cliente")) = lower(trim(p."nome_cliente"))
    AND lower(trim(c."endereco")) = lower(trim(p."endereco_destino"))
  ORDER BY c."id"
  LIMIT 1
)
WHERE p."cliente_id" IS NULL
  AND trim(coalesce(p."nome_cliente", '')) <> '';

-- AlterTable
ALTER TABLE "Pedido" DROP COLUMN "nome_cliente";
