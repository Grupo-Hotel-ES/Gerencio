// Mock da API do iFood: monta o pedido no formato v1.0 do iFood e dispara o
// webhook para a rota de integração do Gerencio (POST /api/webhooks/ifood).

import { createHmac } from "node:crypto";

const URL_WEBHOOK = process.env["IFOOD_WEBHOOK_URL"] ?? "http://localhost:3005/api/webhooks/ifood";
const SEGREDO_WEBHOOK = process.env["IFOOD_WEBHOOK_SECRET"];
const TIMEOUT_WEBHOOK_MS = 5000;

// ---------------------------------------------------------------------------
// Formato v1.0 do iFood
// ---------------------------------------------------------------------------

export type OptionIFood = {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  price: number;
  externalCode?: string;
};

export type ItemIFood = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  externalCode?: string;
  observations?: string;
  options?: OptionIFood[];
};

export type PedidoIFood = {
  id: string; // Order ID do iFood
  displayId: string; // ID curto ex: "4921"
  createdAt: string;
  orderType: "DELIVERY" | "TAKEOUT" | "INDOOR";
  salesChannel: "IFOOD";
  merchant: {
    id: string; // ID do restaurante no iFood
    name: string;
  };
  customer: {
    id: string;
    name: string;
    taxPayerIdentificationNumber?: string; // CPF
    phone?: string;
  };
  items: ItemIFood[];
  total: {
    subTotal: number;
    deliveryFee: number;
    benefits: number; // Descontos
    orderAmount: number;
  };
  payments: {
    prepaid: boolean; // pago online
    pending: number; // valor pendente a pagar na entrega
    methods: Array<{
      value: number;
      currency: "BRL";
      method: "CREDIT" | "DEBIT" | "CASH" | "MEAL_VOUCHER";
      type: "ONLINE" | "OFFLINE";
    }>;
  };
  delivery?: {
    mode: "DEFAULT" | "ECONOMIC" | "EXPRESS";
    deliveredBy: "IFOOD" | "MERCHANT";
    deliveryAddress: {
      streetName: string;
      streetNumber: string;
      formattedAddress: string;
      neighborhood: string;
      city: string;
      postalCode: string;
      complement?: string;
    };
  };
};

/** Notificação de evento enviada pelo iFood */
export type EventoIFood = {
  id: string;
  code: "PLACED" | "CONFIRMED" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
  fullCode: "ORDER_PLACED" | "ORDER_CONFIRMED";
  orderId: string;
  createdAt: string;
  merchantId: string;
  payload?: PedidoIFood; // Em mocks, podemos embutir o pedido direto no evento
};

// ---------------------------------------------------------------------------
// Conversão: pedido do mock -> pedido iFood
// ---------------------------------------------------------------------------

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

const reais = (centavos: number) => Math.round(centavos) / 100;

export function montarPedidoIFood(dados: DadosPedidoMock): PedidoIFood {
  const cliente = dados.cliente ?? {};
  const pagoOnline = dados.pagamento?.pagoOnline !== false;
  const totalReais = reais(dados.totalCentavos);

  return {
    id: dados.idExterno,
    displayId: dados.idExterno.slice(-4),
    createdAt: dados.criadoEm.toISOString(),
    orderType: dados.tipo === "RETIRADA" ? "TAKEOUT" : "DELIVERY",
    salesChannel: "IFOOD",
    merchant: {
      id: dados.lojaIdExterno,
      name: "Restaurante Mock iFood",
    },
    customer: {
      id: String(cliente.id ?? "cust_123"),
      name: String(cliente.nome ?? "Cliente iFood"),
      taxPayerIdentificationNumber: cliente.cpf,
      phone: cliente.telefone,
    },
    items: (dados.itens ?? []).map((item) => ({
      id: String(item.id ?? item.codigoExterno),
      name: item.nome,
      quantity: item.quantidade,
      unitPrice: reais(item.precoUnitarioCentavos),
      totalPrice: reais(item.precoUnitarioCentavos * item.quantidade),
      externalCode: String(item.codigoExterno),
      observations: item.observacao,
      options: (item.complementos ?? []).map((comp: any, i: number) => ({
        id: String(comp?.id ?? `${item.codigoExterno}-${i + 1}`),
        name: typeof comp === "string" ? comp : comp.nome,
        quantity: comp.quantidade ?? 1,
        unitPrice: reais(comp.precoUnitarioCentavos ?? 0),
        price: reais((comp.precoUnitarioCentavos ?? 0) * (comp.quantidade ?? 1)),
        externalCode: comp.codigoExterno,
      })),
    })),
    total: {
      subTotal: reais(dados.subtotalCentavos),
      deliveryFee: reais(dados.taxaEntregaCentavos),
      benefits: reais(dados.descontoPlataformaCentavos + dados.descontoLojaCentavos),
      orderAmount: totalReais,
    },
    payments: {
      prepaid: pagoOnline,
      pending: pagoOnline ? 0 : totalReais,
      methods: [
        {
          value: totalReais,
          currency: "BRL",
          method: dados.pagamento?.metodo === "DINHEIRO" ? "CASH" : "CREDIT",
          type: pagoOnline ? "ONLINE" : "OFFLINE",
        },
      ],
    },
    delivery: dados.tipo === "RETIRADA" ? undefined : {
      mode: "DEFAULT",
      deliveredBy: dados.entreguePor === "LOJA" ? "MERCHANT" : "IFOOD",
      deliveryAddress: {
        streetName: String(dados.endereco?.rua ?? ""),
        streetNumber: String(dados.endereco?.numero ?? ""),
        formattedAddress: `${dados.endereco?.rua}, ${dados.endereco?.numero}`,
        neighborhood: String(dados.endereco?.bairro ?? ""),
        city: String(dados.endereco?.cidade ?? ""),
        postalCode: String(dados.endereco?.cep ?? ""),
        complement: dados.endereco?.complemento,
      },
    },
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

export async function dispararWebhookNovoPedidoIFood(dados: DadosPedidoMock): Promise<ResultadoWebhook> {
  const pedido = montarPedidoIFood(dados);
  
  // Encapsulamos dentro do evento "ORDER_PLACED" do iFood
  const evento: EventoIFood = {
    id: `evt_${Date.now()}`,
    code: "PLACED",
    fullCode: "ORDER_PLACED",
    orderId: pedido.id,
    createdAt: new Date().toISOString(),
    merchantId: pedido.merchant.id,
    payload: pedido,
  };

  const corpo = JSON.stringify(evento);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SEGREDO_WEBHOOK) headers["X-IFood-Signature"] = assinar(corpo);

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