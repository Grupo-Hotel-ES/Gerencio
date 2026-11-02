// mock/mock_backend/ifood/index.ts

export type SubitemIFood = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
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
  subItems?: SubitemIFood[];
};

export type PedidoIFood = {
  id: string;
  displayId: string;
  createdAt: string;
  orderType: "DELIVERY" | "TAKEOUT";
  orderTiming: "INSTANT" | "SCHEDULED";
  salesChannel: "IFOOD";
  total: {
    subTotal: number;
    deliveryFee: number;
    benefits: number;
    orderAmount: number;
  };
  customer: {
    id: string;
    name: string;
    documentNumber?: string;
    phone?: { number: string };
  };
  delivery?: {
    deliveryAddress: {
      streetName: string;
      streetNumber: string;
      neighborhood: string;
      city: string;
      postalCode: string;
      formattedAddress: string;
      complement?: string;
    };
  };
  payments: {
    prepaid: number;
    pending: number;
    methods: Array<{
      value: number;
      currency: string;
      type: "ONLINE" | "OFFLINE";
      method: string;
    }>;
  };
  items: ItemIFood[];
  merchant: {
    id: string;
    name: string;
  };
};

export type EventoIFood = {
  id: string;
  code: string;
  fullCode: string;
  orderId: string;
  merchantId: string;
  createdAt: string;
};

const reais = (centavos: number) => Math.round(centavos) / 100;

export function montarPedidoIFood(dados: any): PedidoIFood {
  const cliente = dados.cliente ?? {};
  const endereco = dados.endereco ?? {};
  const pagoOnline = dados.pagamento?.pagoOnline !== false;

  const subTotal = reais(dados.subtotalCentavos ?? 0);
  const deliveryFee = reais(dados.taxaEntregaCentavos ?? 0);
  const benefits = reais((dados.descontoPlataformaCentavos ?? 0) + (dados.descontoLojaCentavos ?? 0));
  const orderAmount = reais(dados.totalCentavos ?? 0);

  const rua = String(endereco.rua ?? "");
  const numero = String(endereco.numero ?? "");
  const bairro = String(endereco.bairro ?? "");
  const cidade = String(endereco.cidade ?? "");
  const cep = String(endereco.cep ?? "");

  return {
    id: dados.idExterno,
    displayId: dados.codigoExibicao ?? "0000",
    createdAt: dados.criadoEm ? new Date(dados.criadoEm).toISOString() : new Date().toISOString(),
    orderType: dados.tipo === "RETIRADA" ? "TAKEOUT" : "DELIVERY",
    orderTiming: "INSTANT",
    salesChannel: "IFOOD",
    total: {
      subTotal,
      deliveryFee,
      benefits,
      orderAmount,
    },
    customer: {
      id: `cli-${dados.idExterno}`,
      name: String(cliente.nome ?? "Cliente iFood"),
      documentNumber: cliente.cpf ? String(cliente.cpf) : undefined,
      phone: cliente.telefone ? { number: String(cliente.telefone) } : undefined,
    },
    delivery: dados.tipo === "RETIRADA" ? undefined : {
      deliveryAddress: {
        streetName: rua,
        streetNumber: numero,
        neighborhood: bairro,
        city: cidade,
        postalCode: cep,
        formattedAddress: [`${rua} ${numero}`.trim(), bairro, cep, cidade].filter(Boolean).join(", "),
        complement: endereco.complemento ? String(endereco.complemento) : undefined,
      },
    },
    payments: {
      prepaid: pagoOnline ? orderAmount : 0,
      pending: pagoOnline ? 0 : orderAmount,
      methods: [
        {
          value: orderAmount,
          currency: "BRL",
          type: pagoOnline ? "ONLINE" : "OFFLINE",
          method: dados.pagamento?.metodo ?? "CREDIT",
        },
      ],
    },
    items: (dados.itens ?? []).map((item: any, index: number) => ({
      id: String(item.codigoExterno ?? index + 1),
      name: item.nome,
      quantity: Number(item.quantidade),
      unitPrice: reais(item.precoUnitarioCentavos),
      totalPrice: reais(item.precoUnitarioCentavos * item.quantidade),
      externalCode: String(item.codigoExterno ?? index + 1),
      observations: item.observacao,
    })),
    merchant: {
      id: String(dados.lojaIdExterno ?? "ifood-loja-mock"),
      name: "Restaurante Mock iFood",
    },
  };
}