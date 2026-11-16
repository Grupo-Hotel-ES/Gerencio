# Análise do PR #50 e notas para o PR de conciliação

Análise inicial por inspeção em 16/11/2026. A entrega de conciliação autorizada posteriormente está descrita a seguir; as tabelas e o checklist originais registram o diagnóstico antes das correções.

- [PR #50 — Página de ganhos de motoboys](https://github.com/Grupo-Hotel-ES/Gerencio/pull/50), de Gabriel Fraga (`gfragarib-alt`).
- Revisão analisada da `fraga`: `e0835f875ceaadeb47d582c6cfbc7d10af3119c8`.
- Develop atual: `59027fd`, que já inclui a conciliação do backend de ganhos do PR #47 pelo PR #54.
- Ancestral comum entre as branches: `7ac3693`. O diff do PR não representa todas as alterações ocorridas desde essa base.
- Branch local das anotações: `codex/analise-pr50`.

O padrão do PR foi avaliado em duas dimensões: composição visual e integração funcional. A página usa os componentes e tokens compartilhados e os protótipos web/mobile de controle de ganhos. Os dados fictícios permitem demonstrar a interface; na integração com o backend disponível, o modo de demonstração precisa ficar explícito e as operações financeiras precisam refletir o resultado real da API.

## O que já está alinhado

- `Pagina`, `Grade`, `Cartao`, `Chip`, `Etiqueta`, `Texto`, `useCores`, `Espacamento` e `Raio` são os mesmos elementos usados no painel atual.
- O PR oferece filtros, métricas e extrato em tabela ou cartões conforme a largura disponível.
- O backend de ganhos agora está na develop. A adaptação feita no PR #54 conserva `pedido.nomeCliente` na resposta do extrato, embora internamente o nome venha da relação `Cliente`. A tela não precisa voltar ao schema antigo.
- O `requisitar` exportado por `api-pedidos.ts` continua existindo e atualmente delega ao HTTP compartilhado com sessão. A importação usada pelo serviço de ganhos do PR pode ser preservada.

## Novidades e diferenças na develop que devem acompanhar o comentário do PR

| Área atual | Diferença em relação ao PR #50 | Tratamento na conciliação |
| --- | --- | --- |
| Cadastro operacional de motoboys | A develop possui listagem, cadastro, edição e atualização de status por API. O PR parte de uma tela anterior e o seletor de ganhos usa `MOTOBOYS_DEMO` | Preservar o CRUD atual e acrescentar o acesso a Ganhos. O seletor deve reconhecer os IDs dos motoboys cadastrados, inclusive os recebidos pela navegação |
| Serviço `api-motoboys.ts` | O arquivo foi adicionado independentemente nas duas branches: a develop contém CRUD, enquanto o PR contém extrato, resumo, pagamentos e quitação | Conciliar as duas famílias de funções. Substituir o arquivo por apenas uma das versões removeria funcionalidades |
| Login e sessão | A develop possui sessão persistida, encerramento por 401 e token no HTTP compartilhado. O serviço atual de CRUD de motoboys ainda usa `fetch` próprio, enquanto o serviço de ganhos importa o helper de pedidos | Registrar essa divergência já existente e alinhar as requisições ao helper autenticado na conciliação, mantendo tratamento real de erro e os contratos do CRUD |
| Navegação e identidade do restaurante | A sidebar atual tem Clientes, identidade configurável e saída da sessão; o PR adiciona Ganhos sobre uma versão anterior | Acrescentar Ganhos mantendo Clientes, marca e sessão. Também conferir a navegação compacta, que usa os mesmos itens |
| Cadastro de clientes | Pedidos agora se relacionam com Cliente, e a develop inclui a página de clientes | Preservar o cadastro e a página. Manter no extrato o contrato compatível já oferecido pelo backend do PR #54 |
| Configurações do estabelecimento | A página atual foi dividida em abas/componentes e usa dados reais. O backend já expõe percentual de repasse, mas a aba de estabelecimento não apresenta esse campo | Registrar a configuração visual do percentual como lacuna de produto a decidir; o PR #50 trata da consulta e da quitação, não entrega esse formulário |
| Relatórios e datas | Relatórios atuais calculam Hoje/7 dias/Mês a partir da data corrente, validam datas e descrevem o intervalo. O PR #50 fixa atalhos e textos em novembro de 2026 | Aproveitar o comportamento de datas reais na página de ganhos. Não classificar os atalhos demonstrativos como comportamento final de produção |
| Exportação de PDF | A develop ganhou exportação de relatório de vendas; o PR #50 não propõe exportação do extrato financeiro | Preservar a exportação de vendas. A necessidade de PDF de ganhos é uma decisão de escopo, não uma regressão causada pelo PR |
| Catálogo e estoque | A develop passou a vincular produtos às plataformas e arquivar produtos com histórico | Preservar essas funcionalidades. Elas não são substituídas pela página financeira e não precisam copiar sua composição de tela |
| Planejamento de rotas | A develop possui mapa, cálculo e exportação reais, além da prévia ilustrativa | Preservar a página e seus serviços. Ganhos e planejamento de rotas têm funções distintas; compartilhar tokens/componentes não exige uma tela igual |

### Diferenças visuais a registrar, sem classificar automaticamente como defeito

- As páginas atuais de Clientes e Relatórios usam `CartaoResumo` (valor em tamanho 24, peso 600). Ganhos monta cartões próprios com valor em tamanho 28, peso 700 e etiquetas. Decidir na revisão visual se o destaque financeiro específico será mantido ou se haverá um padrão comum.
- Ganhos usa tabela a partir de 800 de largura de conteúdo e quatro métricas a partir de 960. Esses limites precisam ser conferidos com a sidebar e a navegação compacta atuais; não foram validados visualmente nesta análise.
- O seletor tem largura mínima de 260 e os dois campos de data permanecem em linha com largura mínima de 140 cada. Há risco de transbordamento em telas estreitas; conferir web e mobile contra os protótipos.
- O fundo do modal usa `rgba(0,0,0,0.4)` diretamente, enquanto a instrução atual pede cores via tokens. A conciliação deve decidir o token compartilhado para essa sobreposição.

## Bloqueios funcionais do PR original a tratar antes de integrar

| Prioridade | Evidência na revisão do PR | Efeito e encaminhamento |
| --- | --- | --- |
| Alta | `ganhos.tsx:212–214` e `248–250` capturam falhas de pagamento/quitação e continuam atualizando a tela e exibindo sucesso | A interface pode mostrar uma entrega paga sem persistência. Apresentar o erro e só atualizar após confirmação da API; usar o resultado real da quitação e recarregar os dados |
| Alta | `api-motoboys.ts:211–229` e `248–274` devolvem dados demonstrativos em falhas de consulta, inclusive erros HTTP | Uma falha de rede ou sessão pode parecer um extrato válido. Separar demonstração explícita da consulta operacional e exibir estados de erro/vazio |
| Alta | `ganhos.tsx:245–246` envia sempre `2026-11-01` a `2026-11-05` para quitar | O período enviado pode divergir do selecionado. Consulta, rótulos e quitação devem usar o mesmo intervalo validado |
| Média | `ganhos.tsx:84–88` usa somente o cadastro demonstrativo no seletor | Um motoboy real recebido por `motoboyId` pode não ser encontrado, e a página seleciona outro. Carregar a lista real e tratar ID ausente/inválido |
| Média | `ganhos.tsx:115`, `167` e `178`: o estado de carregamento começa falso e só é desligado | A tela não sinaliza corretamente a consulta. Implementar carregamento e bloqueio das ações durante gravações, evitando repetição de cliques |
| Média | Atalhos e textos de período são fixos em `ganhos.tsx:192–199`, `317` e `483` | Os títulos e atalhos podem contrariar os filtros e a data atual. Derivar os textos e os limites da mesma seleção |

Os números de linha referem-se ao commit `e0835f8`, não a uma futura versão conciliada. Esta etapa não implementou essas correções nem adicionou testes. A revisão visual e as verificações de lint, tipos e comportamento devem ocorrer na implementação da conciliação.

## Texto pronto para acompanhar a descrição/comentário do futuro PR

### Entrega de conciliação autorizada em 16/11/2026

- Preservados os commits do Fraga, os protótipos e a composição visual da página. O commit de união inclui crédito de coautoria a Gabriel Fraga.
- Resolvidos os conflitos da navegação e da página de motoboys, mantendo Clientes, marca, sessão e CRUD, com o novo acesso a Ganhos.
- Unificados os serviços de cadastro e ganhos. Todas essas chamadas agora usam o helper autenticado de pedidos, que delega ao HTTP compartilhado.
- Removidos os retornos financeiros fictícios em falhas da API. O seletor usa motoboys reais, respeita o parâmetro de navegação e informa ausência de cadastro/ID inválido.
- Datas, atalhos e rótulos passaram a usar o período atual/selecionado, com validação de datas reais e início até o fim. A quitação recebe esse mesmo intervalo.
- Pagamentos atualizam a tela após confirmação e nova consulta ao servidor. A quitação mostra quantidade e valor retornados pela API. Falhas são apresentadas, com atualização manual disponível.
- Acrescentados bloqueio de operações simultâneas, invalidação de respostas de consultas antigas e proteção para não exibir o extrato anterior sob um novo entregador/período.
- Campos de datas podem quebrar linha; o seletor deixou de impor largura mínima fixa. O modal usa a cor do tema. Preservados o backend, suas migrations e as funcionalidades de catálogo, clientes, configurações, PDF de vendas e rotas.
- Corrigido o carregamento inicial de motoboys para atualizar estado após a resposta, com proteção contra desmontagem.

Validação desta entrega: checagem de tipos do frontend e lint dos cinco arquivos novos/conciliados. O lint global também foi executado e revelou problemas preexistentes fora do escopo, em Assinatura (aspas no JSX) e TopBar (atualização síncrona em effect), além de importação não utilizada em Perfil.

Não houve teste interativo web/mobile nesta entrega, nem novos cenários automatizados de interface. A verificação visual dos protótipos, a acessibilidade, o fuso horário em dispositivos e as operações financeiras em condições de concorrência continuam exigindo atenção. A edição visual do percentual e PDF de ganhos permanecem decisões de escopo; não foram implementados implicitamente.

O checklist abaixo é o inventário original para rastrear decisões; os itens implementados devem ser lidos junto desta seção de entrega, não como uma lista atual de bloqueios.

### Compatibilidade com a develop atual e pontos de revisão

O PR #50 foi comparado com a develop `59027fd`, já contendo o backend de ganhos conciliado no PR #54. Sua composição visual será a referência para a nova página. A conciliação precisa manter as funcionalidades acrescentadas desde a base original.

- [ ] Preservar o CRUD de motoboys e unir suas funções às APIs de ganhos, sem perder exports de nenhuma versão.
- [ ] Substituir o seletor demonstrativo pela lista operacional e respeitar o `motoboyId` recebido da página de motoboys.
- [ ] Preservar login, token e expiração de sessão; registrar e corrigir o uso de `fetch` próprio no CRUD atual de motoboys.
- [ ] Manter Clientes, identidade do restaurante e logout na navegação, acrescentando Ganhos nas versões ampla e compacta.
- [ ] Usar datas reais e o mesmo intervalo validado na consulta, no texto e na quitação; aproveitar o padrão funcional da página atual de Relatórios.
- [ ] Exibir falhas reais de leitura e gravação. Confirmações de pagamento não podem ser substituídas por sucesso local demonstrativo.
- [ ] Manter o contrato do nome do cliente no extrato já adaptado pelo backend, preservando o cadastro atual de clientes.
- [ ] Preservar catálogo/estoque, configurações em abas, exportação de PDF de vendas e planejamento de rotas da develop.
- [ ] Registrar como decisões de escopo a edição visual do percentual de repasse e eventual PDF do extrato: essas partes não são entregues pelo PR #50 original.
- [ ] Revisar a diferença entre `CartaoResumo` e os cartões financeiros do protótipo; validar campos, modal e tabela em telas estreitas e usar tokens para a sobreposição.
- [ ] Após implementar, executar lint/tipos e verificar consulta, filtros, pagamento e quitação com o backend atual. Novos cenários automatizados devem ser apresentados ao responsável antes da implementação, conforme a política do projeto.

Esta lista registra pendências e decisões para a conciliação; não declara que os ajustes já foram entregues. As diferenças de escopo entre páginas não autorizam remover funcionalidades novas da develop ou acrescentar recursos financeiros não aprovados.
