-- CreateTable
CREATE TABLE "produtos_plataforma" (
    "id" UUID NOT NULL,
    "plataforma" "plataforma" NOT NULL,
    "id_externo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'Sem categoria',
    "preco_centavos" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "sincronizado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "produtos_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "produtos_plataforma_plataforma_id_externo_key" ON "produtos_plataforma"("plataforma", "id_externo");

-- CreateIndex
CREATE INDEX "produtos_plataforma_plataforma_nome_idx" ON "produtos_plataforma"("plataforma", "nome");

-- Saldo e preço nunca negativos, como no estoque do Gerêncio
ALTER TABLE "produtos_plataforma" ADD CONSTRAINT "produtos_plataforma_quantidade_nao_negativa" CHECK ("quantidade" >= 0);
ALTER TABLE "produtos_plataforma" ADD CONSTRAINT "produtos_plataforma_preco_nao_negativo" CHECK ("preco_centavos" >= 0);
