// API do mock: recebe os pedidos montados no mock_frontend e grava no banco do mock
// (Pedido + Evento inicial), simulando o "mundo externo" das plataformas de delivery.
//
// Executar a partir de mock/:  pnpm api   (Node >= 22.18 roda TypeScript direto)

import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../../src/generated/prisma/client.ts";
import type { Plataforma, TipoPedido, EntreguePor, CanalEvento } from "../../src/generated/prisma/enums.ts";
import { montarPedidoRappi, dispararWebhookNovoPedido as dispararWebhookRappi } from "../rappi/index.ts";
import { montarPedidoUber, dispararWebhookUber, dispararWebhookFalhaUber } from "../uber/index.ts";

const PORTA = Number(process.env["MOCK_API_PORT"] ?? 3333);
const RESTAURANTE_ID_PADRAO = process.env["MOCK_RESTAURANTE_ID"] ?? "restaurante-mock";
const UBER_CLIENT_SECRET = process.env["UBER_CLIENT_SECRET"] || 'mock_secret_key';

export const uberTimers = new Map<string, NodeJS.Timeout>();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["MOCK_DATABASE_URL"] }),
});

// ---------------------------------------------------------------------------
// Configuração por plataforma
// ---------------------------------------------------------------------------

type ConfigPlataforma = {
  statusInicial: string;
  tipoEventoNovoPedido: string;
  canal: CanalEvento;
  prazoAceiteSegundos: number;
  lojaIdPadrao: string;
  gerarIdExterno: () => string;
};

const PLATAFORMAS: Record<Plataforma, ConfigPlataforma> = {
  IFOOD: {
    statusInicial: "PLACED",
    tipoEventoNovoPedido: "PLACED",
    canal: "POLLING",
    prazoAceiteSegundos: 8 * 60,
    lojaIdPadrao: "ifood-loja-mock",
    gerarIdExterno: () => randomUUID(),
  },
  NOVENTA_NOVE_FOOD: {
    statusInicial: "SENT",
    tipoEventoNovoPedido: "1001",
    canal: "WEBHOOK",
    prazoAceiteSegundos: 5 * 60,
    lojaIdPadrao: "99-loja-mock",
    gerarIdExterno: () => String(Math.floor(Math.random() * 1e9)),
  },
  KEETA: {
    statusInicial: "SENT",
    tipoEventoNovoPedido: "NEW_ORDER",
    canal: "WEBHOOK",
    prazoAceiteSegundos: 5 * 60,
    lojaIdPadrao: "keeta-loja-mock",
    gerarIdExterno: () => String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, "0"),
  },
  UBER_EATS: {
    statusInicial: "CREATED",
    tipoEventoNovoPedido: "orders.notification",
    canal: "WEBHOOK",
    prazoAceiteSegundos: 690,
    lojaIdPadrao: "uber-loja-mock",
    gerarIdExterno: () => randomUUID(),
  },
  RAPPI: {
    statusInicial: "SENT",
    tipoEventoNovoPedido: "NEW_ORDER",
    canal: "WEBHOOK",
    prazoAceiteSegundos: 6 * 60,
    lojaIdPadrao: "rappi-loja-mock",
    gerarIdExterno: () => String(Math.floor(Math.random() * 1e8)),
  },
};

function normalizarPlataforma(valor: unknown): Plataforma | null {
  if (typeof valor !== "string") return null;
  const chave = valor.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const mapa: Record<string, Plataforma> = {
    ifood: "IFOOD",
    "99food": "NOVENTA_NOVE_FOOD",
    "99": "NOVENTA_NOVE_FOOD",
    noventanovefood: "NOVENTA_NOVE_FOOD",
    keeta: "KEETA",
    ubereats: "UBER_EATS",
    uber: "UBER_EATS",
    rappi: "RAPPI",
  };
  return mapa[chave] ?? null;
}

// ---------------------------------------------------------------------------
// HTTP utilitários
// ---------------------------------------------------------------------------

class ErroHttp extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

function enviarJson(res: ServerResponse, status: number, corpo?: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
}

async function lerCorpo(req: IncomingMessage): Promise<any> {
  const partes: Buffer[] = [];
  for await (const parte of req) partes.push(parte as Buffer);
  if (partes.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf-8"));
  } catch {
    throw new ErroHttp(400, "Corpo da requisição não é um JSON válido");
  }
}

function aplicarCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function exigirInteiroNaoNegativo(valor: unknown, campo: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) throw new ErroHttp(400, `"${campo}" deve ser um inteiro >= 0`);
  return n;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type ItemEntrada = {
  codigoExterno?: string | number;
  nome: string;
  quantidade: number;
  precoUnitarioCentavos: number;
  observacao?: string;
  complementos?: Prisma.InputJsonValue[];
};

async function criarPedido(corpo: any) {
  const plataforma = normalizarPlataforma(corpo.plataforma);
  if (!plataforma) throw new ErroHttp(400, `Plataforma inválida: ${JSON.stringify(corpo.plataforma)}`);
  const config = PLATAFORMAS[plataforma];

  const cliente = typeof corpo.cliente === "string" ? { nome: corpo.cliente } : corpo.cliente;
  if (!cliente?.nome || typeof cliente.nome !== "string") throw new ErroHttp(400, '"cliente.nome" é obrigatório');

  const tipo: TipoPedido = corpo.tipo === "RETIRADA" ? "RETIRADA" : "ENTREGA";
  const entreguePor: EntreguePor = corpo.entreguePor === "LOJA" ? "LOJA" : "PLATAFORMA";

  let endereco: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  if (tipo === "ENTREGA") {
    if (!corpo.endereco) throw new ErroHttp(400, '"endereco" é obrigatório para pedidos de entrega');
    endereco = typeof corpo.endereco === "string" ? { rua: corpo.endereco } : corpo.endereco;
  }

  if (!Array.isArray(corpo.itens) || corpo.itens.length === 0) {
    throw new ErroHttp(400, '"itens" deve ser uma lista não vazia');
  }
  const itens = (corpo.itens as ItemEntrada[]).map((item, i) => {
    if (!item?.nome) throw new ErroHttp(400, `"itens[${i}].nome" é obrigatório`);
    const quantidade = exigirInteiroNaoNegativo(item.quantidade, `itens[${i}].quantidade`);
    if (quantidade === 0) throw new ErroHttp(400, `"itens[${i}].quantidade" deve ser maior que 0`);
    return {
      codigoExterno: String(item.codigoExterno ?? i + 1),
      nome: item.nome,
      quantidade,
      precoUnitarioCentavos: exigirInteiroNaoNegativo(item.precoUnitarioCentavos, `itens[${i}].precoUnitarioCentavos`),
      ...(item.observacao ? { observacao: item.observacao } : {}),
      complementos: item.complementos ?? [],
    };
  });

  const subtotalCentavos = itens.reduce((s, it) => s + it.quantidade * it.precoUnitarioCentavos, 0);
  const taxaEntregaCentavos = tipo === "ENTREGA" ? exigirInteiroNaoNegativo(corpo.taxaEntregaCentavos ?? 0, "taxaEntregaCentavos") : 0;
  const descontoPlataformaCentavos = exigirInteiroNaoNegativo(corpo.descontoPlataformaCentavos ?? 0, "descontoPlataformaCentavos");
  const descontoLojaCentavos = exigirInteiroNaoNegativo(corpo.descontoLojaCentavos ?? 0, "descontoLojaCentavos");
  const totalCentavos = Math.max(0, subtotalCentavos + taxaEntregaCentavos - descontoPlataformaCentavos - descontoLojaCentavos);

  const pagamento = corpo.pagamento ?? { pagoOnline: true, metodo: "CREDITO" };
  const agora = new Date();
  const idExterno = config.gerarIdExterno();
  const codigoExibicao = String(Math.floor(1000 + Math.random() * 9000));
  const lojaIdExterno = String(corpo.lojaIdExterno ?? config.lojaIdPadrao);

  const dadosPedido = {
    plataforma,
    idExterno,
    codigoExibicao,
    lojaIdExterno,
    restauranteId: String(corpo.restauranteId ?? RESTAURANTE_ID_PADRAO),
    status: config.statusInicial,
    tipo,
    agendadoPara: corpo.agendadoPara ? new Date(corpo.agendadoPara) : null,
    entreguePor,
    cliente,
    itens: itens as Prisma.InputJsonValue,
    subtotalCentavos,
    taxaEntregaCentavos,
    descontoPlataformaCentavos,
    descontoLojaCentavos,
    totalCentavos,
    pagamento,
    observacao: corpo.observacao ?? null,
    codigoColeta: entreguePor === "PLATAFORMA" ? String(Math.floor(1000 + Math.random() * 9000)) : null,
    prazoAceiteEm: new Date(agora.getTime() + config.prazoAceiteSegundos * 1000),
  };

  const enderecoJson = endereco === Prisma.DbNull ? null : endereco;
  const pedidoRappi = plataforma === "RAPPI" ? montarPedidoRappi({ ...dadosPedido, itens, endereco: enderecoJson, criadoEm: agora }) : null;
  const pedidoUber = plataforma === "UBER_EATS" ? montarPedidoUber({ ...dadosPedido, itens, endereco: enderecoJson, criadoEm: agora }) : null;
  
  const payload = pedidoRappi ?? pedidoUber ?? { ...dadosPedido, id: idExterno, endereco: enderecoJson };
  
  const payloadEvento = pedidoRappi
    ? [pedidoRappi]
    : { tipo: config.tipoEventoNovoPedido, pedidoId: idExterno, lojaId: lojaIdExterno, criadoEm: agora.toISOString() };

  const pedido = await prisma.pedido.create({
    data: {
      ...dadosPedido,
      endereco,
      payload: payload as Prisma.InputJsonValue,
      eventos: {
        create: {
          plataforma,
          tipo: config.tipoEventoNovoPedido,
          canal: config.canal,
          payload: payloadEvento as Prisma.InputJsonValue,
        },
      },
    },
    include: { eventos: true },
  });

  if (pedidoRappi) void notificarWebhookRappi(pedido.eventos[0]!.id, pedidoRappi);
  if (pedidoUber) {
    const urlDestino = process.env["UBER_WEBHOOK_URL"] ?? "http://localhost:3005/api/webhooks/ubereats";
    void notificarWebhookUber(pedido.eventos[0]!.id, idExterno, lojaIdExterno, urlDestino);
  }

  return pedido;
}

async function notificarWebhookRappi(eventoId: string, pedidoRappi: Parameters<typeof dispararWebhookRappi>[0][number]) {
  const resultado = await dispararWebhookRappi([pedidoRappi]);
  if (!resultado.ok) console.warn(`[rappi] Webhook falhou (${resultado.statusHttp ?? resultado.erro})`);
  await prisma.evento
    .update({
      where: { id: eventoId },
      data: { tentativas: { increment: 1 }, ultimoStatusHttp: resultado.statusHttp, ...(resultado.ok ? { ackEm: new Date() } : {}) },
    })
    .catch((erro) => console.error("[rappi] Erro ao registrar tentativa do webhook:", erro));
}

export async function notificarWebhookUber(eventoId: string, pedidoIdExterno: string, lojaIdExterno: string, webhookUrl: string): Promise<void> {
  try {
    const response = await dispararWebhookUber(eventoId, pedidoIdExterno, webhookUrl, UBER_CLIENT_SECRET);

    if (response.status === 200) {
      await prisma.evento.update({
        where: { id: eventoId },
        data: { ackEm: new Date() }
      });

      const timer = setTimeout(async () => {
        await verificarTimeoutUber(pedidoIdExterno, lojaIdExterno, webhookUrl);
      }, 690 * 1000);

      uberTimers.set(pedidoIdExterno, timer);
    }
  } catch (error) {
    console.error(`[UBER_EATS] Erro ao processar webhook orders.notification (Evento: ${eventoId}):`, error);
  }
}

async function verificarTimeoutUber(pedidoIdExterno: string, lojaIdExterno: string, webhookUrl: string): Promise<void> {
  try {
    const pedido = await prisma.pedido.findUnique({
      where: {
        plataforma_idExterno: {
          plataforma: "UBER_EATS",
          idExterno: pedidoIdExterno
        }
      }
    });

    if (pedido && pedido.status === "CREATED") {
      const pedidoAtualizado = await prisma.pedido.update({
        where: { id: pedido.id },
        data: {
          status: "FAILED",
          eventos: {
            create: {
              plataforma: "UBER_EATS",
              tipo: "orders.failure",
              canal: "WEBHOOK",
              payload: {
                tipo: "orders.failure",
                pedidoId: pedidoIdExterno,
                status: "FAILED",
                criadoEm: new Date().toISOString()
              }
            }
          }
        },
        include: {
          eventos: {
            orderBy: { criadoEm: "desc" },
            take: 1
          }
        }
      });

      const eventoFalhaId = pedidoAtualizado.eventos[0]!.id;
      
      const response = await dispararWebhookFalhaUber(eventoFalhaId, pedidoIdExterno, lojaIdExterno, webhookUrl, UBER_CLIENT_SECRET);
      
      if (response.ok) {
        await prisma.evento.update({
          where: { id: eventoFalhaId },
          data: { ackEm: new Date() }
        });
      }
    }
  } catch (error) {
    console.error(`[UBER_EATS] Erro ao verificar timeout do pedido ${pedidoIdExterno}:`, error);
  }
}

async function listarPedidos(params: URLSearchParams) {
  const where: Prisma.PedidoWhereInput = {};
  const plataforma = params.get("plataforma");
  if (plataforma) {
    const p = normalizarPlataforma(plataforma);
    if (!p) throw new ErroHttp(400, `Plataforma inválida: ${plataforma}`);
    where.plataforma = p;
  }
  if (params.get("status")) where.status = params.get("status")!;
  if (params.get("restauranteId")) where.restauranteId = params.get("restauranteId")!;

  return prisma.pedido.findMany({ where, orderBy: { criadoEm: "desc" }, take: Math.min(Number(params.get("limite") ?? 50), 200) });
}

async function buscarPedido(id: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id }, include: { eventos: { orderBy: { criadoEm: "asc" } } } });
  if (!pedido) throw new ErroHttp(404, "Pedido não encontrado");
  return pedido;
}

async function atualizarStatus(id: string, corpo: any) {
  if (!corpo.status || typeof corpo.status !== "string") throw new ErroHttp(400, '"status" é obrigatório');
  const pedido = await buscarPedido(id);
  const tipoEvento = typeof corpo.tipoEvento === "string" ? corpo.tipoEvento : corpo.status;

  return prisma.pedido.update({
    where: { id },
    data: {
      status: corpo.status,
      eventos: {
        create: {
          plataforma: pedido.plataforma,
          tipo: tipoEvento,
          canal: PLATAFORMAS[pedido.plataforma].canal,
          payload: { tipo: tipoEvento, pedidoId: pedido.idExterno, status: corpo.status, criadoEm: new Date().toISOString() },
        },
      },
    },
    include: { eventos: { orderBy: { criadoEm: "asc" } } },
  });
}

async function removerPedido(id: string) {
  await buscarPedido(id);
  await prisma.pedido.delete({ where: { id } });
}

async function listarEventos(params: URLSearchParams) {
  const where: Prisma.EventoWhereInput = {};
  const plataforma = params.get("plataforma");
  if (plataforma) {
    const p = normalizarPlataforma(plataforma);
    if (!p) throw new ErroHttp(400, `Plataforma inválida: ${plataforma}`);
    where.plataforma = p;
  }
  const canal = params.get("canal");
  if (canal === "WEBHOOK" || canal === "POLLING") where.canal = canal;
  if (params.get("pendentes") === "true") where.ackEm = null;

  return prisma.evento.findMany({ where, orderBy: { criadoEm: "asc" }, take: Math.min(Number(params.get("limite") ?? 100), 500) });
}

async function confirmarEvento(id: string) {
  const evento = await prisma.evento.findUnique({ where: { id } });
  if (!evento) throw new ErroHttp(404, "Evento não encontrado");
  return prisma.evento.update({ where: { id }, data: { ackEm: evento.ackEm ?? new Date() } });
}

// ---------------------------------------------------------------------------
// Roteamento
// ---------------------------------------------------------------------------

const UUID = "([0-9a-fA-F-]{36})";

async function rotear(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const { pathname, searchParams } = url;
  const metodo = req.method ?? "GET";
  let m: RegExpMatchArray | null;

  if (metodo === "POST" && pathname === "/oauth/v2/token") {
    return enviarJson(res, 200, {
      access_token: randomUUID(),
      token_type: "Bearer",
      expires_in: 2592000
    });
  }

  if (metodo === "GET" && pathname === "/health") {
    await prisma.$queryRaw`SELECT 1`;
    return enviarJson(res, 200, { ok: true });
  }
  if (metodo === "GET" && pathname === "/plataformas") {
    return enviarJson(res, 200, Object.keys(PLATAFORMAS));
  }

  if (pathname === "/pedidos") {
    if (metodo === "GET") return enviarJson(res, 200, await listarPedidos(searchParams));
    if (metodo === "POST") return enviarJson(res, 201, await criarPedido(await lerCorpo(req)));
  }
  if ((m = pathname.match(new RegExp(`^/pedidos/${UUID}$`)))) {
    if (metodo === "GET") return enviarJson(res, 200, await buscarPedido(m[1]!));
    if (metodo === "DELETE") {
      await removerPedido(m[1]!);
      return enviarJson(res, 204);
    }
  }
  if ((m = pathname.match(new RegExp(`^/pedidos/${UUID}/status$`))) && metodo === "PATCH") {
    return enviarJson(res, 200, await atualizarStatus(m[1]!, await lerCorpo(req)));
  }

  if (pathname === "/eventos" && metodo === "GET") {
    return enviarJson(res, 200, await listarEventos(searchParams));
  }
  if ((m = pathname.match(new RegExp(`^/eventos/${UUID}/ack$`))) && metodo === "POST") {
    return enviarJson(res, 200, await confirmarEvento(m[1]!));
  }

  if ((m = pathname.match(new RegExp(`^/v2/eats/order/${UUID}$`))) && metodo === "GET") {
    const pedido = await prisma.pedido.findFirst({
      where: { 
        idExterno: m[1], 
        plataforma: "UBER_EATS" 
      }
    });

    if (!pedido) throw new ErroHttp(404, "Pedido não encontrado");
    
    return enviarJson(res, 200, pedido.payload);
  }

  if ((m = pathname.match(new RegExp(`^/v1/eats/orders/${UUID}/accept_pos_order$`))) && metodo === "POST") {
    const pedidoIdExterno = m[1]!;

    if (uberTimers.has(pedidoIdExterno)) {
      clearTimeout(uberTimers.get(pedidoIdExterno));
      uberTimers.delete(pedidoIdExterno);
    }

    const pedido = await prisma.pedido.findFirst({
      where: { idExterno: pedidoIdExterno, plataforma: "UBER_EATS" }
    });

    if (!pedido) throw new ErroHttp(404, "Pedido não encontrado");

    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        status: "ACCEPTED",
        eventos: {
          create: {
            plataforma: "UBER_EATS",
            tipo: "ACCEPTED",
            canal: "WEBHOOK",
            payload: { 
              tipo: "ACCEPTED", 
              pedidoId: pedidoIdExterno, 
              status: "ACCEPTED", 
              criadoEm: new Date().toISOString() 
            }
          }
        }
      }
    });

    res.writeHead(204);
    return res.end();
  }

  if ((m = pathname.match(new RegExp(`^/v1/eats/orders/${UUID}/deny_pos_order$`))) && metodo === "POST") {
    const pedidoIdExterno = m[1]!;
    const corpo = await lerCorpo(req);

    if (uberTimers.has(pedidoIdExterno)) {
      clearTimeout(uberTimers.get(pedidoIdExterno));
      uberTimers.delete(pedidoIdExterno);
    }

    const pedido = await prisma.pedido.findFirst({
      where: { idExterno: pedidoIdExterno, plataforma: "UBER_EATS" }
    });

    if (!pedido) throw new ErroHttp(404, "Pedido não encontrado");

    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        status: "DENIED",
        eventos: {
          create: {
            plataforma: "UBER_EATS",
            tipo: "DENIED",
            canal: "WEBHOOK",
            payload: {
              tipo: "DENIED",
              pedidoId: pedidoIdExterno,
              status: "DENIED",
              deny_reason: corpo.deny_reason,
              criadoEm: new Date().toISOString()
            }
          }
        }
      }
    });

    res.writeHead(204);
    return res.end();
  }

  throw new ErroHttp(404, `Rota não encontrada: ${metodo} ${pathname}`);
}

const servidor = createServer(async (req, res) => {
  aplicarCors(res);
  if (req.method === "OPTIONS") return enviarJson(res, 204);

  try {
    await rotear(req, res);
  } catch (erro) {
    if (erro instanceof ErroHttp) return enviarJson(res, erro.status, { erro: erro.message });
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return enviarJson(res, 409, { erro: "Pedido duplicado para esta plataforma" });
    }
    console.error(erro);
    enviarJson(res, 500, { erro: "Erro interno" });
  }
});

servidor.listen(PORTA, () => {
  console.log(`Mock API ouvindo em http://localhost:${PORTA}`);
});

async function encerrar() {
  servidor.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);