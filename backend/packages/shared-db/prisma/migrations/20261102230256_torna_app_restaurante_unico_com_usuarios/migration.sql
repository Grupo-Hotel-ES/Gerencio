-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('administrador', 'gerente', 'operador');

-- AlterTable
ALTER TABLE "Restaurante" ADD COLUMN     "bairro" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "categoria" TEXT NOT NULL DEFAULT 'Restaurante',
ADD COLUMN     "complemento" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "configuracoes" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "logradouro" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "numero" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "razao_social" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "uf" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "telefone" TEXT NOT NULL DEFAULT '',
    "papel" "PapelUsuario" NOT NULL DEFAULT 'operador',
    "senha_hash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_login_key" ON "Usuario"("login");

-- Dados: separa o endereço atual em logradouro e número ("Rua X, 100" -> "Rua X" / "100")
UPDATE "Restaurante"
SET "logradouro" = regexp_replace("endereco", ',\s*[0-9]+[A-Za-z]?\s*$', ''),
    "numero" = coalesce(substring("endereco" from ',\s*([0-9]+[A-Za-z]?)\s*$'), '')
WHERE "logradouro" = '';

-- Dados: o app atende um restaurante só; garante que ele exista (editado em Configurações)
INSERT INTO "Restaurante" ("cnpj", "nome", "email", "telefone", "cep", "cidade", "endereco")
SELECT '00.000.000/0000-00', 'Meu restaurante', '', '', '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM "Restaurante");
