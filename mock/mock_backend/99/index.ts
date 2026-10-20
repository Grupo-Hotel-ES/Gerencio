// Mock da API da 99Food: monta o pedido no formato nativo da 99Food e dispara o
// webhook de novo pedido para a rota de integração do Gerencio
// (POST /api/webhooks/99food em backend/api-integracao).
//
// Diferente da Rappi (cujo webhook já carrega o pedido inteiro), aqui o webhook é uma
// notificação enxuta: só avisa que existe um pedido novo (evento 1001, com o orderId).
// A integração busca os detalhes depois, em GET /pedidos/:id da mock_api (campo `payload`,
// que guarda o pedido montado por montarPedido99Food) e confirma o evento em
// POST /eventos/:id/ack.

import { createHmac, randomUUID } from "node:crypto";

const URL_WEBHOOK = process.env["NOVENTA_NOVE_FOOD_WEBHOOK_URL"] ?? "http://localhost:3005/api/webhooks/99food";
const SEGREDO_WEBHOOK = process.env["NOVENTA_NOVE_FOOD_WEBHOOK_SECRET"];
const TIMEOUT_WEBHOOK_MS = 5000;

/** Código do evento de novo pedido (mesmo valor de tipoEventoNovoPedido na mock_api). */
export const EVENTO_NOVO_PEDIDO = 1001;

// ---------------------------------------------------------------------------
// Formato nativo da 99Food
// Todos os valores monetários são inteiros em CENTAVOS.
// ---------------------------------------------------------------------------

export type OpcaoItem99Food = {
  option_id: string;
  name: string;
  quantity: number;
  unit_price: number;
};

export type ItemPedido99Food = {
  item_id: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  remark: string;
  options: OpcaoItem99Food[];
};

export type Pedido99Food = {
  order_id: string;
  display_id: string;
  status: string;
  order_type: "DELIVERY" | "PICKUP";
  delivery_by: "PLATFORM" | "MERCHANT" | null;
  created_at: string;
  scheduled_for: string | null;
  pickup_code: string | null;
  remark: string;
  shop: {
    shop_id: string;
    merchant_id: string;
  };
  customer: {
    name: string;
    phone: string;
    document_number: string;
    email: string;
  };
  delivery_address: {
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    postal_code: string;
    formatted: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
  items: ItemPedido99Food[];
  payment: {
    paid_online: boolean;
    method: "CREDIT" | "DEBIT" | "PIX" | "CASH";
    change_for: number | null;
  };
  amounts: {
    items_total: number;
    delivery_fee: number;
    platform_discount: number;
    merchant_discount: number;
    order_total: number;
    amount_to_collect: number;
  };
};

/** Corpo do webhook de novo pedido: só avisa, os detalhes vêm por GET. */
export type EventoNovoPedido99Food = {
  eventId: typeof EVENTO_NOVO_PEDIDO;
  messageId: string;
  shopId: string;
  timestamp: number;
  orderId: string;
};

// ---------------------------------------------------------------------------
// Conversão: pedido do mock -> pedido 99Food
// ---------------------------------------------------------------------------

export type DadosPedidoMock = {
  idExterno: string;
  codigoExibicao?: string;
  lojaIdExterno: string;
  restauranteId: string;
  status?: string;
  tipo: "ENTREGA" | "RETIRADA";
  entreguePor: "PLATAFORMA" | "LOJA";
  cliente: any;
  endereco: any;
  itens: any[];
  subtotalCentavos: number;
  taxaEntregaCentavos: number;
  descontoPlataformaCentavos: number;
  descontoLojaCentavos: number;
  totalCentavos: number;
  pagamento: any;
  observacao?: string | null;
  agendadoPara?: Date | null;
  codigoColeta?: string | null;
  criadoEm: Date;
};

const centavos = (valor: unknown) => Math.round(Number(valor ?? 0));

function numeroOuNulo(valor: unknown): number | null {
  const n = Number(valor);
  return valor === undefined || valor === null || !Number.isFinite(n) ? null : n;
}

function montarEndereco(endereco: any): Pedido99Food["delivery_address"] {
  if (!endereco) return null;
  const rua = String(endereco.rua ?? "");
  const numero = String(endereco.numero ?? "");
  const bairro = String(endereco.bairro ?? "");
  const cidade = String(endereco.cidade ?? "");
  const cep = String(endereco.cep ?? "");
  return {
    street: rua,
    number: numero,
    complement: String(endereco.complemento ?? ""),
    district: bairro,
    city: cidade,
    postal_code: cep,
    formatted: [`${rua} ${numero}`.trim(), bairro, cidade, cep].filter(Boolean).join(", "),
    latitude: numeroOuNulo(endereco.latitude),
    longitude: numeroOuNulo(endereco.longitude),
  };
}

function montarItens(itens: any[]): ItemPedido99Food[] {
  return itens.map((item) => {
    const codigo = String(item.codigoExterno);
    const precoUnitario = centavos(item.precoUnitarioCentavos);
    return {
      item_id: codigo,
      sku: codigo,
      name: item.nome,
      quantity: item.quantidade,
      unit_price: precoUnitario,
      total_price: precoUnitario * item.quantidade,
      remark: item.observacao ?? "",
      options: (item.complementos ?? []).map((comp: any, i: number) => ({
        option_id: String(comp?.codigoExterno ?? `${codigo}-${i + 1}`),
        name: typeof comp === "string" ? comp : String(comp?.nome ?? ""),
        quantity: Number(comp?.quantidade ?? 1),
        unit_price: centavos(comp?.precoUnitarioCentavos),
      })),
    };
  });
}

function montarMetodoPagamento(metodo: unknown): Pedido99Food["payment"]["method"] {
  switch (metodo) {
    case "DINHEIRO":
      return "CASH";
    case "DEBITO":
      return "DEBIT";
    case "PIX":
      return "PIX";
    default:
      return "CREDIT";
  }
}

export function montarPedido99Food(dados: DadosPedidoMock): Pedido99Food {
  const cliente = dados.cliente ?? {};
  const pagoOnline = dados.pagamento?.pagoOnline !== false;
  const entrega = dados.tipo === "ENTREGA";

  return {
    order_id: dados.idExterno,
    display_id: dados.codigoExibicao ?? dados.idExterno.slice(-4),
    status: dados.status ?? "SENT",
    order_type: entrega ? "DELIVERY" : "PICKUP",
    delivery_by: entrega ? (dados.entreguePor === "LOJA" ? "MERCHANT" : "PLATFORM") : null,
    created_at: dados.criadoEm.toISOString(),
    scheduled_for: dados.agendadoPara ? dados.agendadoPara.toISOString() : null,
    pickup_code: dados.codigoColeta ?? null,
    remark: dados.observacao ?? "",
    shop: {
      shop_id: dados.lojaIdExterno,
      merchant_id: dados.restauranteId,
    },
    customer: {
      name: String(cliente.nome ?? ""),
      phone: String(cliente.telefone ?? ""),
      document_number: String(cliente.cpf ?? ""),
      email: String(cliente.email ?? ""),
    },
    delivery_address: entrega ? montarEndereco(dados.endereco) : null,
    items: montarItens(dados.itens),
    payment: {
      paid_online: pagoOnline,
      method: montarMetodoPagamento(dados.pagamento?.metodo),
      change_for: numeroOuNulo(dados.pagamento?.trocoParaCentavos),
    },
    amounts: {
      items_total: centavos(dados.subtotalCentavos),
      delivery_fee: centavos(dados.taxaEntregaCentavos),
      platform_discount: centavos(dados.descontoPlataformaCentavos),
      merchant_discount: centavos(dados.descontoLojaCentavos),
      order_total: centavos(dados.totalCentavos),
      amount_to_collect: pagoOnline ? 0 : centavos(dados.totalCentavos),
    },
  };
}

/** Monta o corpo do webhook (notificação enxuta) para um pedido já montado. */
export function montarEventoNovoPedido99Food(pedido: Pedido99Food): EventoNovoPedido99Food {
  return {
    eventId: EVENTO_NOVO_PEDIDO,
    messageId: randomUUID(),
    shopId: pedido.shop.shop_id,
    timestamp: Math.floor(Date.now() / 1000),
    orderId: pedido.order_id,
  };
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

function assinar(corpo: string): string {
  const t = Date.now();
  const sign = createHmac("sha256", SEGREDO_WEBHOOK!).update(`${t}.${corpo}`).digest("hex");
  return `t=${t},sign=${sign}`;
}

export type ResultadoWebhook = { ok: boolean; statusHttp: number | null; erro?: string };

export async function dispararWebhookNovoPedido(evento: EventoNovoPedido99Food): Promise<ResultadoWebhook> {
  const corpo = JSON.stringify(evento);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SEGREDO_WEBHOOK) headers["99Food-Signature"] = assinar(corpo);

  try {
    const resposta = await fetch(URL_WEBHOOK, {
      method: "POST",
      headers,
      body: corpo,
      signal: AbortSignal.timeout(TIMEOUT_WEBHOOK_MS),
    });
    return { ok: resposta.ok, statusHttp: resposta.status };
  } catch (erro) {
    return { ok: false, statusHttp: null, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}