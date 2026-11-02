-- CreateTable
CREATE TABLE "SessaoChatbot" (
    "telefone" TEXT NOT NULL,
    "historico" JSONB NOT NULL DEFAULT '[]',
    "cliente_id" INTEGER,
    "pedido_pendente" JSONB,
    "ultimo_pedido_id" INTEGER,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessaoChatbot_pkey" PRIMARY KEY ("telefone")
);

-- CreateTable
CREATE TABLE "MensagemChatbot" (
    "id" SERIAL NOT NULL,
    "telefone" TEXT NOT NULL,
    "mensagem_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "recebida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemChatbot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MensagemChatbot_mensagem_id_key" ON "MensagemChatbot"("mensagem_id");

-- CreateIndex
CREATE INDEX "MensagemChatbot_telefone_idx" ON "MensagemChatbot"("telefone");

