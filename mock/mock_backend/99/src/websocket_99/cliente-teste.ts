/**
 * Cliente de teste — simula o lado do GERÔNCIO consumindo este mock.
 *
 * Isso NÃO faz parte do mock em si. É uma ferramenta para você ver o fluxo
 * inteiro funcionando na sua máquina, sem depender de o backend do Gerôncio
 * estar pronto. Também serve de referência para quem for implementar o
 * consumidor de verdade.
 *
 * Como usar (em dois terminais):
 *   terminal 1:  pnpm dev
 *   terminal 2:  pnpm cliente-teste
 *   terminal 3:  curl -X POST http://localhost:4004/simular/novo-pedido
 */

import WebSocket from 'ws';
import type { NotificacaoNovoPedido, Pedido } from './types.js';

const BASE_URL = process.env.MOCK_URL ?? 'http://localhost:4004';
const WS_URL = BASE_URL.replace('http', 'ws') + '/ws';
const API_KEY = process.env.API_KEY ?? 'mock-99food-dev-key';

/** PASSO 3 e 4: busca os detalhes completos do pedido. */
async function buscarDetalhes(pedidoId: string): Promise<Pedido> {
  const resposta = await fetch(`${BASE_URL}/v1/pedidos/${pedidoId}`, {
    headers: { 'x-api-key': API_KEY },
  });

  if (!resposta.ok) {
    throw new Error(`Falha ao buscar pedido ${pedidoId}: HTTP ${resposta.status}`);
  }

  return (await resposta.json()) as Pedido;
}

/** PASSO 5: confirma o recebimento. */
async function enviarAcknowledgement(pedidoId: string, aceito: boolean): Promise<void> {
  const resposta = await fetch(`${BASE_URL}/v1/pedidos/${pedidoId}/acknowledgement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      aceito,
      ...(aceito ? {} : { motivoRecusa: 'Item fora de estoque' }),
    }),
  });

  if (!resposta.ok) {
    throw new Error(`Falha no acknowledgement: HTTP ${resposta.status}`);
  }
}

// --------------------------------------------------------------------------

const socket = new WebSocket(WS_URL);

socket.on('open', () => console.log('[cliente] conectado ao mock da 99Food'));

socket.on('message', async (dados) => {
  const mensagem = JSON.parse(dados.toString());

  if (mensagem.tipo !== 'NOVO_PEDIDO') {
    console.log('[cliente] mensagem recebida:', mensagem);
    return;
  }

  const { pedidoId } = mensagem as NotificacaoNovoPedido;
  console.log(`\n[cliente] notificação de pedido novo: ${pedidoId}`);

  try {
    const pedido = await buscarDetalhes(pedidoId);
    console.log('[cliente] detalhes recebidos:');
    console.log(`          cliente : ${pedido.cliente.nome}`);
    console.log(`          endereço: ${pedido.endereco.logradouro}, ${pedido.endereco.numero}`);
    console.log(`          itens   : ${pedido.itens.map((i) => `${i.quantidade}x ${i.nome}`).join(', ')}`);
    console.log(`          total   : R$ ${pedido.total.toFixed(2)}`);

    // Aqui, no Gerôncio de verdade, entraria o INSERT no PostgreSQL.
    await enviarAcknowledgement(pedidoId, true);
    console.log('[cliente] acknowledgement enviado ✓');
  } catch (erro) {
    console.error('[cliente] erro no processamento:', (erro as Error).message);
  }
});

socket.on('error', (erro) => console.error('[cliente] erro:', erro.message));
socket.on('close', () => console.log('[cliente] conexão encerrada'));