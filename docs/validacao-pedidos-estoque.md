# Pedidos e estoque do dashboard

O estoque representa **unidades dos produtos vendidos**, por restaurante. O dashboard usa as APIs locais; não depende do mock para cadastrar produtos ou pedidos manuais.

## Iniciar sem apagar os dados

Com o Docker Desktop em execução, abra um terminal PowerShell:

```powershell
cd C:\gerencio\backend
pnpm dev
```

Esse comando sobe o Postgres, aplica as migrations pendentes, gera o Prisma Client e inicia as APIs. Se as APIs já estiverem em containers, pare esses serviços antes de iniciar outra cópia nas mesmas portas. Para usar as APIs em containers, execute primeiro `pnpm db:up` e `pnpm db:deploy` em `backend/`; depois execute `pnpm backend:docker` na raiz para reconstruir os serviços. O atalho Docker sozinho não aplica migrations.

Em `backend/.env`, mantenha `DATABASE_URL` e outras credenciais, mas **não defina `PORT` para todas as APIs**: cada serviço usa uma porta própria (3001 a 3005). Um `PORT=3001` compartilhado faz todos tentarem abrir a mesma porta.

Em outro terminal:

```powershell
cd C:\gerencio\frontend
pnpm install --ignore-scripts
pnpm web --port 8081
```

Abra http://localhost:8081. A página do mock na porta 3000 é outro sistema.

As URLs padrão estão em `frontend/.env.example`. Para alterá-las, copie para `frontend/.env` e reinicie o Expo. Em celular ou outro computador, use o IP da máquina das APIs. Produtos usa a raiz `:3004`; pedidos e restaurantes usam o prefixo `/api`.

## Validar pela tela

1. Tenha pelo menos um restaurante cadastrado na API de restaurantes (`POST http://localhost:3003/api/restaurantes`). O dashboard ainda não tem formulário de cadastro de restaurante.
2. Abra **Estoque**, escolha o restaurante e use **Cadastrar produto**. Informe nome, categoria, preço e quantidade inicial. A edição do produto abre em seguida: em **Códigos nas plataformas**, informe o código (SKU) que o produto tem em cada aplicativo, por exemplo `SKU-IFOOD-123`. Sem código, o produto não aparece no cardápio daquela plataforma no simulador e os pedidos dela não são reconhecidos. O botão **Editar** de cada produto permite mudar nome, categoria, preço e códigos, ou excluir o produto.
3. Edite uma quantidade e clique em **Salvar ajustes**. Recarregue a página e confirme que o saldo permanece.
4. Abra **Pedidos → Novo pedido**. Escolha restaurante, cliente, canal, pagamento, retirada ou entrega e produtos. O servidor calcula o preço dos pedidos de balcão/WhatsApp com o catálogo salvo.
5. O pedido aparece como **Novo**, ainda sem baixar o saldo. Clique em **Aceitar pedido**: o status vira **Preparando** e as unidades são descontadas.
6. Marque como pronto, confirme a saída e depois a entrega. O pedido permanece visível enquanto estiver em entrega e sai da fila quando entregue.
7. Em outro pedido aceito, confirme o cancelamento antes da saída. O saldo deve ser devolvido uma única vez.
8. Para verificar conflito de edição, deixe um ajuste de estoque pendente em uma aba e aceite um pedido do mesmo produto em outra. Ao salvar o ajuste antigo, a tela deve informar o conflito, mantendo o rascunho. Use **Descartar ajustes e recarregar**, confira o novo saldo e refaça o ajuste.
9. Para verificar estoque insuficiente, crie dois pedidos que juntos ultrapassem o saldo. Após aceitar o primeiro, o segundo deve continuar novo, com aviso de insuficiência; nenhum dos seus itens pode sofrer baixa parcial.

O dashboard consulta novamente as APIs a cada dez segundos. O estoque suspende essa atualização enquanto há ajustes pendentes. Os rascunhos de estoque não são persistidos ao sair da página: salve antes de navegar.

## Regras e limites desta etapa

- A migration preserva os dados existentes. Produtos antigos começam com **saldo zero** e categoria **Sem categoria**: informe o saldo disponível antes de aceitar novos pedidos.
- Pedidos antigos não sofrem baixa retroativa. Cancelar um pedido antigo que nunca baixou estoque também não credita unidades.
- Novos pedidos não podem misturar produtos de restaurantes diferentes. Pedidos antigos são associados ao restaurante quando todos os itens pertencem à mesma loja; casos ambíguos ficam sem associação.
- Aceite e baixa são atômicos. Repetir o mesmo status não desconta novamente. Ajustes de saldo usam versão para evitar sobrescrever uma venda simultânea.
- Cancelamento com devolução é permitido antes da saída. Após a saída, o fluxo disponível é confirmar a entrega; devoluções posteriores exigem uma regra de negócio futura.
- Produtos usados em pedidos não podem ser apagados pela API de produtos. Zere o saldo para impedir novas vendas manuais.
- O saldo salvo é local ao Gerôncio. O envio do saldo e de alterações de status para iFood e demais plataformas não foi implementado nesta etapa.
- Sem internet, pedidos manuais e estoque funcionam com o frontend disponível e as APIs e o Postgres locais em execução. Não há fila offline no navegador nem garantia de primeira abertura sem os arquivos do frontend disponíveis. Integrações externas precisam de conexão.

## Testes automatizados com banco separado

O executor cria um PostgreSQL temporário exclusivo, aplica as migrations existentes e executa todos os testes de integração. Não use o banco de desenvolvimento nem configure `DATABASE_URL` manualmente. Consulte as [regras de testes](regras-de-testes.md), a [cobertura atual](cobertura-testes.md) e os [bugs reproduzidos](bugs-testes.md).

```powershell
cd C:\gerencio
pnpm test:integracao
```

Com Docker em execução e dependências do backend instaladas, o comando escolhe uma porta disponível em `127.0.0.1`. O container é removido ao final, inclusive se um teste falhar. O relatório fica em `.resultados-testes/integracao.tap`; uma falha retorna código diferente de zero e deve ser investigada.

Verificações de código:

```powershell
cd C:\gerencio\backend
pnpm typecheck
cd ..\frontend
pnpm lint
pnpm exec tsc --noEmit
pnpm exec expo export --platform web
```
