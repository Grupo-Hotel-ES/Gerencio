-- CreateEnum
CREATE TYPE "StatusEntregador" AS ENUM ('disponivel', 'em_entrega', 'inativo');

-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('em_preparo', 'saiu_para_entrega', 'entregue', 'cancelado');

-- CreateEnum
CREATE TYPE "TipoFuncionario" AS ENUM ('PROPRIETARIO', 'ENTREGADOR', 'CAIXA');

-- CreateTable
CREATE TABLE "Restaurante" (
    "id" SERIAL NOT NULL,
    "cnpj" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,

    CONSTRAINT "Restaurante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredencialPlataforma" (
    "id" SERIAL NOT NULL,
    "plataforma" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "restaurante_id" INTEGER NOT NULL,

    CONSTRAINT "CredencialPlataforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Funcionario" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tipo" "TipoFuncionario" NOT NULL DEFAULT 'ENTREGADOR',
    "status" "StatusEntregador",

    CONSTRAINT "Funcionario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VinculoFuncionario" (
    "id" SERIAL NOT NULL,
    "restaurante_id" INTEGER NOT NULL,
    "funcionario_id" INTEGER NOT NULL,
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "data_fim" TIMESTAMP(3),

    CONSTRAINT "VinculoFuncionario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "preco" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstoqueProduto" (
    "id" SERIAL NOT NULL,
    "restaurante_id" INTEGER NOT NULL,
    "produto_id" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL,

    CONSTRAINT "EstoqueProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapeamentoApp" (
    "id" SERIAL NOT NULL,
    "plataforma" TEXT NOT NULL,
    "id_externo_app" TEXT NOT NULL,
    "produto_id" INTEGER NOT NULL,

    CONSTRAINT "MapeamentoApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstoqueSyncLog" (
    "id" SERIAL NOT NULL,
    "plataforma" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mensagem_erro" TEXT,
    "data_tentativa" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "produto_id" INTEGER NOT NULL,

    CONSTRAINT "EstoqueSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER,
    "preco" DECIMAL(10,2) NOT NULL,
    "metodo_pagamento" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "endereco_destino" TEXT NOT NULL,
    "cep_destino" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" "StatusPedido" NOT NULL DEFAULT 'em_preparo',

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "nome_cliente" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "cpf" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPedido" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "produto_id" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL,

    CONSTRAINT "ItemPedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entrega" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "entregador_id" INTEGER,
    "custo_entrega" DECIMAL(10,2) NOT NULL,
    "data_hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurante_cnpj_key" ON "Restaurante"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Funcionario_cpf_key" ON "Funcionario"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_cpf_key" ON "Cliente"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Entrega_pedido_id_key" ON "Entrega"("pedido_id");

-- AddForeignKey
ALTER TABLE "CredencialPlataforma" ADD CONSTRAINT "CredencialPlataforma_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "Restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoFuncionario" ADD CONSTRAINT "VinculoFuncionario_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "Restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoFuncionario" ADD CONSTRAINT "VinculoFuncionario_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "Funcionario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueProduto" ADD CONSTRAINT "EstoqueProduto_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueProduto" ADD CONSTRAINT "EstoqueProduto_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "Restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoApp" ADD CONSTRAINT "MapeamentoApp_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueSyncLog" ADD CONSTRAINT "EstoqueSyncLog_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_entregador_id_fkey" FOREIGN KEY ("entregador_id") REFERENCES "Funcionario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
