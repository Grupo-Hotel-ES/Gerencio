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

1. O app atende um restaurante só, criado pela migration; os dados dele ficam em **Configurações → Estabelecimento**.
2. Os produtos são cadastrados nas plataformas de delivery, não no Gerêncio. Suba o mock (veja [Vincular produtos das plataformas](#vincular-produtos-das-plataformas)), abra o **portal do restaurante** em http://localhost:3000/restaurante, escolha a plataforma e cadastre o produto com nome, categoria, preço e quantidade. A plataforma mostra o **ID** gerado para ele (ex.: `SKU-123-ABC` no iFood, `145-789` na Rappi). Depois, no Gerêncio, abra **Estoque → Vincular produto**, selecione as plataformas, cole o ID de cada uma e use **Conferir**. Informe o preço e a quantidade que valem para todas as plataformas e clique em **Vincular produto**. O botão **Editar** de cada produto permite mudar nome, categoria e preço, vincular ou desvincular IDs e excluir o produto.
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
- **Editar → Excluir produto** arquiva o produto em vez de apagá-lo: ele sai do estoque, do cardápio do WhatsApp e de novos pedidos e fica **indisponível** nas plataformas vinculadas, sem sumir delas. Continua nos pedidos antigos e nos relatórios. Se o restaurante repuser unidades no portal de uma plataforma, ele volta ao estoque do Gerêncio. Pela API, `DELETE /produtos/:id` continua recusando produtos que aparecem em pedidos.
- O saldo e o preço são enviados às plataformas vinculadas pela sincronização descrita em [Vincular produtos das plataformas](#vincular-produtos-das-plataformas). O envio de alterações de status de pedido para iFood e demais plataformas não foi implementado nesta etapa.
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

## Vincular produtos das plataformas

O mock tem duas páginas: http://localhost:3000 é o **app do cliente**, que faz pedidos, e http://localhost:3000/restaurante é o **portal do restaurante**, onde cada plataforma (iFood, Rappi, Uber Eats, 99 Food e Keeta) tem seu cardápio. O app do cliente lê o cardápio e o estoque da plataforma escolhida, mesmo antes de o produto ser vinculado no Gerêncio.

Com o produto vinculado, o saldo e o preço valem para todas as plataformas: a `api-integracao` envia a quantidade e o preço do Gerêncio para as plataformas vinculadas a cada poucos segundos, sempre que algo muda. No portal, o produto aparece como **Vinculado ao Gerêncio**, e o estoque e o preço mudados lá vão para o Gerêncio, que repassa às outras plataformas.

Comportamentos esperados:

1. **Vincular:** a quantidade e o preço informados no Gerêncio chegam a todas as plataformas vinculadas, mesmo que estivessem diferentes em cada uma.
2. **Pedido no app do cliente:** a plataforma do pedido desconta o próprio estoque na hora. No Gerêncio, o pedido chega como **Novo** e as unidades ficam **reservadas**: o saldo salvo não muda (a baixa continua no aceite), mas as outras plataformas recebem o saldo menos a reserva. A página de Estoque mostra "Nas plataformas: N un. (X reservadas em pedidos ainda não aceitos)".
3. **Aceite:** baixa o estoque do Gerêncio; o saldo das plataformas não muda, porque já estava reservado.
4. **Cancelamento antes do aceite:** a reserva é desfeita e as plataformas recebem as unidades de volta.
5. **Ajuste manual ou mudança de preço no Gerêncio:** chega a todas as plataformas vinculadas.
6. **Pedido acima do estoque:** o app do cliente mostra "Acima do limite do estoque" no item e, ao finalizar, "Erro ao realizar pedido", porque a API do mock recusa o pedido.
7. **Desvincular** (em Editar): a plataforma volta a controlar o estoque daquele produto.
8. **Estoque zero ou produto excluído no Gerêncio:** o produto aparece como **Indisponível** no portal e no app do cliente, que não deixa adicioná-lo; um pedido enviado direto à API do mock é recusado com "X está indisponível no iFood". Ele só some das plataformas quando é excluído no portal.
9. **Estoque ou preço mudado no portal:** vai para o Gerêncio e para as outras plataformas vinculadas. O número digitado é o disponível para venda: com unidades reservadas, o saldo do Gerêncio fica esse número mais a reserva. Se a `api-integracao` estiver fora do ar, o portal avisa e nada muda.
10. **Repor estoque no portal de um produto excluído no Gerêncio:** ele volta ao estoque do Gerêncio com esse saldo, e todas as plataformas vinculadas voltam a vendê-lo.
11. **Vincular de novo o ID de um produto excluído:** o ID passa para o produto novo; as outras plataformas do produto excluído continuam indisponíveis.

O botão **Sincronizar agora**, no Estoque, reenvia tudo; use-o se a `api-integracao` ficou fora do ar ou se alguém mudou um valor direto no banco do mock.

Limitações desta etapa: o 99 Food e o Keeta recebem a sincronização, mas os pedidos deles ainda não chegam ao Gerêncio (sem adaptador na `api-integracao`); a situação da sincronização fica em memória na `api-integracao` e é reenviada por completo quando ela reinicia; o portal do restaurante ainda não pede credenciais da loja; o nome do produto não é sincronizado (cada plataforma mostra o nome cadastrado nela).
