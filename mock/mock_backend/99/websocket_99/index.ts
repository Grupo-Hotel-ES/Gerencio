/**
 * Mock da API da 99Food — Projeto Gerôncio
 * =======================================
 *
 * Este serviço finge ser a 99Food. Ele existe para que o Gerôncio possa ser
 * desenvolvido e testado sem depender da API real (que exige contrato,
 * credenciais e um restaurante cadastrado).
 *
 * FLUXO IMPLEMENTADO (o mesmo do diagrama de sequência):
 *
 *   1. Um pedido novo nasce aqui (por timer ou por chamada manual).
 *   2. [WebSocket]  mock -> Gerôncio : "NOVO_PEDIDO, id = 99F-XXXX"
 *   3. [HTTP GET]   Gerôncio -> mock : requisição pelo pedido
 *   4. [HTTP 200]   mock -> Gerôncio : detalhes completos do pedido
 *   5. [HTTP POST]  Gerôncio -> mock : acknowledgement (aceito/recusado)
 *
 * Existe também o caminho inverso, que é o coração do Gerôncio:
 *   [HTTP PATCH]    Gerôncio -> mock : baixa de estoque de um SKU
 */

import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { createServer } from 'node:http';

import { iniciarWebSocket, notificarNovoPedido, totalDeClientes } from './notifier.js';
import {
  atualizarEstoque,
  buscarPedido,
  cancelarPedido,
  confirmarPedido,
  criarPedidoAleatorio,
  listarEstoque,
  listarPedidos,
} from '../store.js';
import type {
  AcknowledgementBody,
  AtualizacaoEstoqueBody,
  StatusPedido,
} from '../types.js';

// --------------------------------------------------------------------------
// Configuração
// --------------------------------------------------------------------------

const PORTA = Number(process.env.PORT ?? 4004);
/** Chave fake. Serve só para o Gerôncio treinar o envio de credenciais. */
const API_KEY = process.env.API_KEY ?? 'mock-99food-dev-key';
/** Intervalo de geração automática de pedidos. 0 = desligado. */
const INTERVALO_PEDIDOS_MS = Number(process.env.INTERVALO_PEDIDOS_MS ?? 0);

const app = express();

// Faz o Express entender corpo de requisição em JSON (preenche `req.body`).
app.use(express.json());

// Log simples de toda requisição que chega — ajuda demais a depurar.
app.use((req, _res, next) => {
  console.log(`[http] ${req.method} ${req.path}`);
  next();
});

// --------------------------------------------------------------------------
// Middleware de autenticação
// --------------------------------------------------------------------------

/**
 * Middleware = função que roda ANTES do handler da rota. Ela pode barrar a
 * requisição (respondendo direto) ou liberar chamando `next()`.
 *
 * As plataformas reais exigem autenticação (OAuth, normalmente). Aqui usamos
 * uma chave simples só para o Gerôncio se acostumar a mandar credenciais.
 */
function exigirApiKey(req: Request, res: Response, next: NextFunction): void {
  const chave = req.header('x-api-key');

  if (chave !== API_KEY) {
    res.status(401).json({
      erro: 'NAO_AUTORIZADO',
      mensagem: 'Header x-api-key ausente ou inválido.',
    });
    return;
  }

  next();
}

// --------------------------------------------------------------------------
// Rotas públicas (sem autenticação)
// --------------------------------------------------------------------------

/** Healthcheck — útil para o Docker saber se o container está saudável. */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    canal: '99FOOD',
    clientesWebSocket: totalDeClientes(),
    pedidosEmMemoria: listarPedidos().length,
  });
});

// --------------------------------------------------------------------------
// Rotas da "API da 99Food" (o que o Gerôncio consome)
// --------------------------------------------------------------------------

/**
 * PASSO 3 e 4 do diagrama: "Requisição pelo pedido" / "Detalhes do pedido".
 *
 * GET /v1/pedidos/:pedidoId
 */
app.get('/v1/pedidos/:pedidoId', exigirApiKey, (req, res) => {
  const pedido = buscarPedido(req.params.pedidoId);

  if (!pedido) {
    res.status(404).json({
      erro: 'PEDIDO_NAO_ENCONTRADO',
      mensagem: `Nenhum pedido com id ${req.params.pedidoId}.`,
    });
    return;
  }

  res.json(pedido);
});

/**
 * Listagem de pedidos — não está no diagrama, mas é a rede de segurança do
 * Gerôncio: se o WebSocket cair, ele consegue recuperar os pedidos pendentes
 * que perdeu chamando esta rota.
 *
 * GET /v1/pedidos?status=PENDENTE
 */
app.get('/v1/pedidos', exigirApiKey, (req, res) => {
  const status = req.query.status as StatusPedido | undefined;
  res.json({ pedidos: listarPedidos(status) });
});

/**
 * PASSO 5 do diagrama: "Acknowledgement".
 *
 * O Gerôncio avisa que recebeu e processou o pedido. Sem isso, a plataforma
 * real assume que o pedido se perdeu e reenvia (ou cancela automaticamente).
 *
 * POST /v1/pedidos/:pedidoId/acknowledgement
 * Body: { "aceito": true }  ou  { "aceito": false, "motivoRecusa": "..." }
 */
app.post('/v1/pedidos/:pedidoId/acknowledgement', exigirApiKey, (req, res) => {
  const { pedidoId } = req.params;
  const { aceito, motivoRecusa } = req.body as AcknowledgementBody;

  const pedido = buscarPedido(pedidoId);
  if (!pedido) {
    res.status(404).json({
      erro: 'PEDIDO_NAO_ENCONTRADO',
      mensagem: `Nenhum pedido com id ${pedidoId}.`,
    });
    return;
  }

  // Validação do corpo: nunca confie no que chega de fora.
  if (typeof aceito !== 'boolean') {
    res.status(400).json({
      erro: 'CORPO_INVALIDO',
      mensagem: 'O campo "aceito" é obrigatório e deve ser booleano.',
    });
    return;
  }

  if (!aceito && !motivoRecusa) {
    res.status(400).json({
      erro: 'CORPO_INVALIDO',
      mensagem: 'Ao recusar, "motivoRecusa" é obrigatório.',
    });
    return;
  }

  // Idempotência: se o Gerôncio mandar o mesmo ack duas vezes (acontece, por
  // reenvio de rede), a segunda chamada não deve quebrar nem mudar o estado.
  if (pedido.status !== 'PENDENTE') {
    res.status(200).json({
      mensagem: 'Pedido já havia sido processado.',
      pedido,
    });
    return;
  }

  const atualizado = aceito ? confirmarPedido(pedidoId) : cancelarPedido(pedidoId);
  res.status(200).json({ mensagem: 'Acknowledgement registrado.', pedido: atualizado });
});

/**
 * Sincronização de estoque — o caminho inverso do fluxo de pedidos.
 *
 * Quando o Gerôncio dá baixa num item (venda em qualquer canal), ele propaga
 * a nova quantidade para cada plataforma. Aqui só registramos em memória e
 * logamos, mas é isso que a 99Food real faria para esgotar o item no app.
 *
 * PATCH /v1/catalogo/itens/:sku/estoque
 * Body: { "quantidadeDisponivel": 12 }
 */
app.patch('/v1/catalogo/itens/:sku/estoque', exigirApiKey, (req, res) => {
  const { sku } = req.params;
  const { quantidadeDisponivel } = req.body as AtualizacaoEstoqueBody;

  if (!Number.isInteger(quantidadeDisponivel) || quantidadeDisponivel < 0) {
    res.status(400).json({
      erro: 'CORPO_INVALIDO',
      mensagem: '"quantidadeDisponivel" deve ser um inteiro maior ou igual a zero.',
    });
    return;
  }

  atualizarEstoque(sku, quantidadeDisponivel);
  console.log(`[estoque] ${sku} -> ${quantidadeDisponivel} unidade(s)`);

  res.json({
    sku,
    quantidadeDisponivel,
    esgotado: quantidadeDisponivel === 0,
    atualizadoEm: new Date().toISOString(),
  });
});

/** Conferência rápida do estoque que o Gerôncio já sincronizou. */
app.get('/v1/catalogo/estoque', exigirApiKey, (_req, res) => {
  res.json({ estoque: listarEstoque() });
});

// --------------------------------------------------------------------------
// Rotas de simulação (não existem na API real — são o "controle remoto" do mock)
// --------------------------------------------------------------------------

/**
 * Gera um pedido na hora e dispara a notificação via WebSocket.
 * É assim que você testa o fluxo inteiro sem esperar timer nenhum:
 *
 *   curl -X POST http://localhost:4004/simular/novo-pedido
 */
app.post('/simular/novo-pedido', (_req, res) => {
  const pedido = criarPedidoAleatorio();
  const notificados = notificarNovoPedido(pedido);

  res.status(201).json({
    mensagem: 'Pedido criado e notificado.',
    clientesNotificados: notificados,
    pedido,
  });
});

// --------------------------------------------------------------------------
// Tratamento de rota inexistente e de erros
// --------------------------------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({ erro: 'ROTA_NAO_ENCONTRADA', mensagem: 'Confira o método e o caminho.' });
});

// Handler de erro do Express: precisa ter exatamente estes 4 parâmetros.
app.use((erro: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[erro]', erro);
  res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: erro.message });
});

// --------------------------------------------------------------------------
// Inicialização
// --------------------------------------------------------------------------

// Criamos o servidor HTTP manualmente (em vez de app.listen) porque o
// WebSocket precisa se acoplar a ele para dividir a mesma porta.
const servidor = createServer(app);
iniciarWebSocket(servidor);

servidor.listen(PORTA, () => {
  console.log(`[http] mock da 99Food em http://localhost:${PORTA}`);
  console.log(`[ws]   WebSocket em ws://localhost:${PORTA}/ws`);

  if (INTERVALO_PEDIDOS_MS > 0) {
    console.log(`[mock] gerando um pedido a cada ${INTERVALO_PEDIDOS_MS}ms`);
    setInterval(() => {
      const pedido = criarPedidoAleatorio();
      notificarNovoPedido(pedido);
    }, INTERVALO_PEDIDOS_MS);
  }
});

// Encerramento limpo: fecha conexões antes de o processo morrer.
process.on('SIGTERM', () => servidor.close(() => process.exit(0)));
process.on('SIGINT', () => servidor.close(() => process.exit(0)));