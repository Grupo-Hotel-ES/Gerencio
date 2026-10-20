// Mock da API da Rappi: monta o pedido no formato nativo da Rappi e dispara o
// webhook de novo pedido para a rota de integração do Gerencio
// (POST /api/webhooks/rappi em backend/api-integracao).
//
// O corpo do webhook é uma LISTA de pedidos, como na API real da Rappi.

import { createHmac } from "node:crypto";

const URL_WEBHOOK = process.env["RAPPI_WEBHOOK_URL"] ?? "http://localhost:3005/api/webhooks/rappi";
// Opcional: quando definido, assina o corpo como a Rappi faz (header Rappi-Signature)
const SEGREDO_WEBHOOK = process.env["RAPPI_WEBHOOK_SECRET"];
const TIMEOUT_WEBHOOK_MS = 5000;

// ---------------------------------------------------------------------------
// Formato nativo da Rappi
// ---------------------------------------------------------------------------

export type SubitemRappi = {
  sku?: string;
  id: string;
  name: string;
  type?: "TOPPING";
  price: number;
  quantity: number;
};

export type ItemRappi = {
  sku?: string;
  id: string;
  name: string;
  type?: "PRODUCT";
  comments: string;
  price: number;
  quantity: number;
  subitems: SubitemRappi[];
};

export type DescontoRappi = {
  value: number;
  description: string;
  title: string;
  product_id: number | null;
  sku: number | null;
  type: string;
  raw_value: number;
  value_type: "percentage" | "fixed";
  max_value: number | null;
  includes_toppings: boolean;
  percentage_by_rappi: number;
  percentage_by_partners: number;
  amount_by_rappi: number;
  amount_by_partner: number;
  discount_product_units: number;
  discount_product_unit_value: number | null;
};

export type PedidoRappi = {
  order_detail: {
    order_id: string;
    cooking_time: number;
    min_cooking_time: number;
    max_cooking_time: number;
    created_at: string;
    delivery_method: "delivery" | "pickup" | "marketplace";
    payment_method: "cc" | "cash";
    delivery_information: {
      city: string;
      complete_address: string;
      street_number: string;
      neighborhood: string;
      complement: string;
      postal_code: string;
      street_name: string;
    } | null;
    billing_information: {
      address: string;
      billing_type: string;
      document_number: string;
      document_type: string;
      email: string;
      name: string;
      phone: string;
    };
    totals: {
      total_products: number;
      total_discounts: number;
      total_order: number;
      total_discount_by_partner: number;
      total_to_pay: number;
      discount_by_support: number;
      charges: { shipping: number; service_fee: number };
      other_totals: { tip: number; total_rappi_pay: number; total_rappi_credits: number };
    };
    items: ItemRappi[];
    delivery_discount: { total_percentage_discount: number; total_value_discount: number };
    discounts: DescontoRappi[];
  };
  customer: {
    first_name: string;
    last_name: string;
    phone_number: string;
    document_number: string;
    user_type: string;
  };
  store: {
    internal_id: string;
    external_id: string;
    name: string;
  };
};

// ---------------------------------------------------------------------------
// Conversão: pedido do mock -> pedido Rappi
// ---------------------------------------------------------------------------

/** Subconjunto dos dados do Pedido do mock necessário para montar o formato Rappi. */
export type DadosPedidoMock = {
  idExterno: string;
  lojaIdExterno: string;
  restauranteId: string;
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
  criadoEm: Date;
};

/** A Rappi Brasil trabalha com valores em reais. */
const reais = (centavos: number) => Math.round(centavos) / 100;

function montarEndereco(endereco: any): PedidoRappi["order_detail"]["delivery_information"] {
  if (!endereco) return null;
  const rua = String(endereco.rua ?? "");
  const numero = String(endereco.numero ?? "");
  const bairro = String(endereco.bairro ?? "");
  const cidade = String(endereco.cidade ?? "");
  const cep = String(endereco.cep ?? "");
  return {
    city: cidade,
    complete_address: [`${rua} ${numero}`.trim(), bairro, cep, cidade].filter(Boolean).join(". "),
    street_number: numero,
    neighborhood: bairro,
    complement: String(endereco.complemento ?? ""),
    postal_code: cep,
    street_name: rua,
  };
}

function montarItens(itens: any[]): ItemRappi[] {
  return itens.map((item) => ({
    sku: String(item.codigoExterno),
    id: String(item.codigoExterno),
    name: item.nome,
    type: "PRODUCT",
    comments: item.observacao ?? "",
    price: reais(item.precoUnitarioCentavos),
    quantity: item.quantidade,
    subitems: (item.complementos ?? []).map((comp: any, i: number) => ({
      sku: String(comp?.codigoExterno ?? `${item.codigoExterno}-${i + 1}`),
      id: String(comp?.codigoExterno ?? `${item.codigoExterno}-${i + 1}`),
      name: typeof comp === "string" ? comp : String(comp?.nome ?? ""),
      type: "TOPPING",
      price: reais(Number(comp?.precoUnitarioCentavos ?? 0)),
      quantity: Number(comp?.quantidade ?? 1),
    })),
  }));
}

function montarDescontos(dados: DadosPedidoMock): DescontoRappi[] {
  const desconto = (valorCentavos: number, pelaRappi: boolean): DescontoRappi => ({
    value: reais(valorCentavos),
    description: "Desconto no pedido",
    title: "Desconto no pedido",
    product_id: null,
    sku: null,
    type: "order_total",
    raw_value: reais(valorCentavos),
    value_type: "fixed",
    max_value: null,
    includes_toppings: false,
    percentage_by_rappi: pelaRappi ? 100 : 0,
    percentage_by_partners: pelaRappi ? 0 : 100,
    amount_by_rappi: pelaRappi ? reais(valorCentavos) : 0,
    amount_by_partner: pelaRappi ? 0 : reais(valorCentavos),
    discount_product_units: 0,
    discount_product_unit_value: null,
  });

  const descontos: DescontoRappi[] = [];
  if (dados.descontoPlataformaCentavos > 0) descontos.push(desconto(dados.descontoPlataformaCentavos, true));
  if (dados.descontoLojaCentavos > 0) descontos.push(desconto(dados.descontoLojaCentavos, false));
  return descontos;
}

export function montarPedidoRappi(dados: DadosPedidoMock): PedidoRappi {
  const cliente = dados.cliente ?? {};
  const [primeiroNome = "", ...sobrenomes] = String(cliente.nome ?? "").trim().split(/\s+/);
  const endereco = montarEndereco(dados.endereco);
  const pagoOnline = dados.pagamento?.pagoOnline !== false;

  return {
    order_detail: {
      order_id: dados.idExterno,
      cooking_time: 10,
      min_cooking_time: 5,
      max_cooking_time: 20,
      created_at: dados.criadoEm.toISOString(),
      delivery_method: dados.tipo === "RETIRADA" ? "pickup" : dados.entreguePor === "LOJA" ? "marketplace" : "delivery",
      payment_method: dados.pagamento?.metodo === "DINHEIRO" ? "cash" : "cc",
      delivery_information: endereco,
      billing_information: {
        address: endereco?.complete_address ?? "",
        billing_type: "Bill",
        document_number: String(cliente.cpf ?? ""),
        document_type: "CPF",
        email: String(cliente.email ?? ""),
        name: String(cliente.nome ?? ""),
        phone: String(cliente.telefone ?? ""),
      },
      totals: {
        total_products: reais(dados.subtotalCentavos),
        total_discounts: reais(dados.descontoPlataformaCentavos + dados.descontoLojaCentavos),
        total_order: reais(dados.totalCentavos),
        total_discount_by_partner: reais(dados.descontoLojaCentavos),
        total_to_pay: pagoOnline ? 0 : reais(dados.totalCentavos),
        discount_by_support: 0,
        charges: { shipping: reais(dados.taxaEntregaCentavos), service_fee: 0 },
        other_totals: { tip: 0, total_rappi_pay: 0, total_rappi_credits: 0 },
      },
      items: montarItens(dados.itens),
      delivery_discount: { total_percentage_discount: 0, total_value_discount: 0 },
      discounts: montarDescontos(dados),
    },
    customer: {
      first_name: primeiroNome,
      last_name: sobrenomes.join(" "),
      phone_number: String(cliente.telefone ?? ""),
      document_number: String(cliente.cpf ?? ""),
      user_type: "USER_NORMAL",
    },
    store: {
      internal_id: dados.lojaIdExterno,
      external_id: dados.restauranteId,
      name: "Loja Mock",
    },
  };
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/** Header no formato da Rappi: t=<timestamp>,sign=<hmac-sha256("<t>.<corpo>")> */
function assinar(corpo: string): string {
  const t = Date.now();
  const sign = createHmac("sha256", SEGREDO_WEBHOOK!).update(`${t}.${corpo}`).digest("hex");
  return `t=${t},sign=${sign}`;
}

export type ResultadoWebhook = { ok: boolean; statusHttp: number | null; erro?: string };

/** Envia os pedidos para a rota de integração. Nunca lança: o resultado indica sucesso ou falha. */
export async function dispararWebhookNovoPedido(pedidos: PedidoRappi[]): Promise<ResultadoWebhook> {
  const corpo = JSON.stringify(pedidos);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SEGREDO_WEBHOOK) headers["Rappi-Signature"] = assinar(corpo);

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
