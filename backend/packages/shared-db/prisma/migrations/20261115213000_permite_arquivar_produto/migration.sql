-- Produto que já aparece em pedidos não pode ser apagado (o histórico de vendas depende dele).
-- Em vez disso, ele é arquivado: sai do estoque, do cardápio e de novos pedidos, mas continua
-- nos pedidos antigos e nos relatórios. Produtos existentes continuam ativos (coluna nula).
ALTER TABLE "Produto" ADD COLUMN "arquivado_em" TIMESTAMP(3);
