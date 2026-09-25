/**
 * Camada de notificação via WebSocket.
 *
 * No diagrama de sequência, este arquivo é o ator "Websocket-delivery":
 * ele mantém uma conexão aberta com o Gerôncio e avisa "tem pedido novo".
 *
 * Por que WebSocket e não uma chamada HTTP comum? Porque aqui QUEM INICIA a
 * conversa é o servidor, não o cliente. Com HTTP normal o Gerôncio teria que
 * ficar perguntando "tem pedido? tem pedido?" de segundo em segundo (polling).
 * Com WebSocket a conexão fica aberta e o aviso chega no instante em que o
 * pedido entra.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { NotificacaoNovoPedido, Pedido } from './types.js';
import { CANAL } from './types.js';

let wss: WebSocketServer | null = null;

/**
 * Sobe o servidor WebSocket "grudado" no mesmo servidor HTTP do Express.
 * Assim os dois compartilham a mesma porta: a API fica em http://host:porta
 * e o WebSocket em ws://host:porta/ws.
 */
export function iniciarWebSocket(servidorHttp: Server): void {
  wss = new WebSocketServer({ server: servidorHttp, path: '/ws' });

  wss.on('connection', (socket: WebSocket) => {
    console.log('[ws] Gerôncio conectado');

    // Mensagem de boas-vindas: ajuda a confirmar que o canal está de pé.
    socket.send(
      JSON.stringify({ tipo: 'CONEXAO_ESTABELECIDA', canal: CANAL }),
    );

    socket.on('close', () => console.log('[ws] Gerôncio desconectado'));
    socket.on('error', (erro) => console.error('[ws] erro:', erro.message));
  });

  console.log('[ws] servidor WebSocket pronto em /ws');
}

/**
 * Dispara a notificação de pedido novo para todos os clientes conectados.
 *
 * Mandamos SÓ o id do pedido, nunca o pedido inteiro. O Gerôncio recebe o
 * aviso e faz um GET para buscar os detalhes — é o passo 2 do diagrama.
 */
export function notificarNovoPedido(pedido: Pedido): number {
  if (!wss) {
    console.warn('[ws] notificação ignorada: WebSocket ainda não iniciado');
    return 0;
  }

  const notificacao: NotificacaoNovoPedido = {
    tipo: 'NOVO_PEDIDO',
    canal: CANAL,
    pedidoId: pedido.id,
    emitidoEm: new Date().toISOString(),
  };

  const payload = JSON.stringify(notificacao);
  let enviados = 0;

  for (const cliente of wss.clients) {
    // readyState OPEN garante que não tentamos escrever num socket morto.
    if (cliente.readyState === WebSocket.OPEN) {
      cliente.send(payload);
      enviados++;
    }
  }

  console.log(`[ws] NOVO_PEDIDO ${pedido.id} -> ${enviados} cliente(s)`);
  return enviados;
}

/** Quantos clientes estão conectados agora (usado no /health). */
export function totalDeClientes(): number {
  return wss ? wss.clients.size : 0;
}