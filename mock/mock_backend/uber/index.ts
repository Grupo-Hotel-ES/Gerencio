// mock_backend/uber/index.ts

import { randomUUID } from "node:crypto";
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Formato nativo do Uber Eats (OpenAPI restaurant_order)
// ---------------------------------------------------------------------------

export interface UberOrder {
  order: {
    id: string;
    display_id: string;
    state: "CREATED" | "ACCEPTED" | "DENIED" | "FAILED" | "UNKNOWN";
    fulfillment_type: "DELIVERY_BY_UBER" | "DELIVERY_BY_MERCHANT" | "DINE_IN" | "PICKUP";
    store: {
      id: string;
      name: string;
    };
    customers: Array<{
      id: string;
      name: {
        first_name: string;
        last_name: string;
      };
      contact: {
        phone: {
          number: string;
        };
      };
    }>;
    carts: Array<{
      id: string;
      items: Array<{
        id: string;
        title: string;
        external_data?: string;
        quantity: {
          amount: number;
        };
      }>;
    }>;
    payment: {
      payment_detail: {
        order_total: {
          net: {
            amount_e5: number;
            currency_code: string;
            formatted: string;
          };
        };
      };
    };
    created_time: string;
  };
}

// ---------------------------------------------------------------------------
// Conversão: pedido do mock -> pedido Uber Eats
// ---------------------------------------------------------------------------

export type DadosPedidoMock = {
  idExterno: string;
  codigoExibicao: string;
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

const centavosParaE5 = (centavos: number) => Math.round(centavos) * 1000;
const formatarBRL = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;

export function montarPedidoUber(dados: DadosPedidoMock): UberOrder {
  const cliente = dados.cliente ?? {};
  const [firstName = "Cliente", ...lastNames] = String(cliente.nome ?? "").trim().split(/\s+/);
  const lastName = lastNames.length > 0 ? lastNames.join(" ") : "Uber";

  const fulfillment_type = 
    dados.tipo === "RETIRADA" ? "PICKUP" : 
    dados.entreguePor === "LOJA" ? "DELIVERY_BY_MERCHANT" : 
    "DELIVERY_BY_UBER";

  return {
    order: {
      id: dados.idExterno,
      display_id: dados.codigoExibicao,
      state: "CREATED",
      fulfillment_type,
      store: {
        id: dados.lojaIdExterno,
        name: "Loja Mock"
      },
      customers: [
        {
          id: randomUUID(),
          name: {
            first_name: firstName,
            last_name: lastName
          },
          contact: {
            phone: {
              number: String(cliente.telefone ?? "+5511999999999")
            }
          }
        }
      ],
      carts: [
        {
          id: randomUUID(),
          items: dados.itens.map((item) => ({
            id: String(item.codigoExterno),
            title: item.nome,
            external_data: String(item.codigoExterno), // Utilizado pelo Gerêncio no resource_href
            quantity: {
              amount: item.quantidade
            }
          }))
        }
      ],
      payment: {
        payment_detail: {
          order_total: {
            net: {
              amount_e5: centavosParaE5(dados.totalCentavos),
              currency_code: "BRL",
              formatted: formatarBRL(dados.totalCentavos)
            }
          }
        }
      },
      created_time: dados.criadoEm.toISOString()
    }
  };
}

export async function dispararWebhookUber(eventoId: string, pedidoId: string, url: string, clientSecret: string): Promise<Response> {
    const payload = {
        event_id: eventoId,
        event_time: Date.now(),
        event_type: "orders.notification",
        meta: {
            resource_id: pedidoId,
            status: "pos",
        },
        resource_href: `https://api.uber.com/v2/eats/orders/${pedidoId}`
    };

    const payloadString = JSON.stringify(payload);
    
    const signature = crypto
        .createHmac('sha256', clientSecret)
        .update(payloadString)
        .digest('hex');

    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Uber-Signature': signature
        },
        body: payloadString
    });
}

export async function dispararWebhookFalhaUber(eventoId: string, pedidoIdExterno: string, lojaIdExterno: string, url: string, clientSecret: string): Promise<Response> {
  const payload = {
    event_id: eventoId,
    event_time: Date.now(),
    event_type: "orders.failure",
    meta: {
      user_id: lojaIdExterno,
      resource_id: pedidoIdExterno,
      status: "FAILED"
    },
    resource_href: `https://api.uber.com/v2/eats/order/${pedidoIdExterno}`
  };

  const payloadString = JSON.stringify(payload);

  const signature = crypto
    .createHmac("sha256", clientSecret)
    .update(payloadString)
    .digest("hex");

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Uber-Signature": signature
    },
    body: payloadString
  });
}