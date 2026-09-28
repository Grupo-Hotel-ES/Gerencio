// src/store.ts
//
// "Banco de dados" falso, em memória, para o mock do Keeta.
// Guarda alguns pedidos de exemplo pré-cadastrados e deixa você
// criar/alterar outros em tempo de execução (útil para simular
// mudanças de status durante o desenvolvimento do frontend).
//
// Isso NÃO persiste em disco: toda vez que o servidor reiniciar
// (ex: pnpm dev com --watch), os dados voltam ao estado inicial
// definido em `seed()`

import type { OrderInfo } from './types.js'

const orders = new Map<string, OrderInfo>()

// Chave composta: orderViewId + shopId, igual ao que o Keeta usa para
// identificar um pedido de forma única no request de POST /order/get.
function key(orderViewId: number, shopId: number): string {
  return `${orderViewId}:${shopId}`
}

function seedOrder(): OrderInfo {
  const now = Date.now()

  return {
    baseOrder: {
      orderViewId: 756823555555859,
      chooseTableware: 1,
      deliveryTime: now + 25 * 60 * 1000, // ETA daqui a 25min
      ctime: now - 5 * 60 * 1000, // pedido feito há 5min
      payType: 'applepay',
      payTypeDesc: 'Apple Pay',
    },
    merchantOrder: {
      ctime: now - 5 * 60 * 1000,
      seqNoStr: '29332222',
      status: 20, // aceito pelo restaurante
      pushOrderResult: 1,
      orderViewId: 756823555555859,
      shopId: 466663,
      shopName: 'Adani Bar',
      unconfirmedStatusTime: now - 5 * 60 * 1000,
      confirmedStatusTime: now - 4 * 60 * 1000,
      userId: 10000011133443,
      userGetMode: 'delivery',
    },
    merchantOrderDeliveries: [
      {
        waybillId: 34524,
        subimitDeliveryResult: 1,
        deliveryStatus: 50,
        deliveryStatusTime: now - 60 * 1000,
        deliveryMode: '9001',
        courierName: 'Jack Ma',
        courierPhone: '+966540505598',
        courierPrivacyPhone: '+96234232424',
        merchantOrderDeliveryHisList: [
          { opTime: now - 4 * 60 * 1000, deliveryStatus: 10 },
          { opTime: now - 60 * 1000, deliveryStatus: 50 },
        ],
      },
    ],
    deliveryInfos: [
      {
        waybillId: 34524,
        estimatedTime: 1500, // 25 min restantes
        estimatedAbsolutelyTime: now + 25 * 60 * 1000,
      },
    ],
    orderPromotionDtlList: [
      {
        i18n: { currency: 'SAR' },
        type: 4,
        typeName: 'Delivery charge discount',
        promotionRuleDesc: 'delivery fee 8 off 0',
        activityId: '5620053',
        reduceFee: 800,
        merchantActivityFee: 400,
        platformActivityFee: 400,
      },
    ],
    recipientInfo: {
      name: 'Pony Ma',
      phone: '+966540505555',
      interCode: '+96',
      addressName: 'Sha Tian, HongKong District',
      houseNumber: 'No. 27, Building 5, Unit 302',
      point: { latitude: 24.7136, longitude: 46.6753 },
    },
    feeDtl: {
      merchantFee: {
        i18n: { currency: 'SAR' },
        productPrice: 4600,
        brokerage: 592,
        activityFee: 900,
        diffPrice: 0,
        total: 2976,
        platformServiceFee: 0,
      },
      customerFee: {
        i18n: { currency: 'SAR' },
        productPrice: 4600,
        shippingFee: 1900,
        platformFee: 0,
        discounts: 1900,
        tip: 0,
        diffPrice: 0,
        payTotal: 4600,
      },
    },
    rebatesTag: false,
    bigOrderTag: false,
    products: [
      {
        spuId: 11020674,
        skuId: 9968694,
        count: 1,
        price: 3600,
        priceStr: 'SAR 36.00',
        originPrice: 3600,
        originPriceStr: 'SAR 36.00',
        name: 'Sweet & Sour Pork Ribs',
        id: 325842225,
        currency: 'SAR',
      },
      {
        spuId: 11020675,
        skuId: 9968695,
        count: 1,
        price: 1000,
        priceStr: 'SAR 10.00',
        originPrice: 1000,
        originPriceStr: 'SAR 10.00',
        name: 'Refrigerante 2L',
        id: 325842226,
        currency: 'SAR',
      },
    ],
  }
}

function seed() {
  const o = seedOrder()
  orders.set(key(o.baseOrder.orderViewId, o.merchantOrder.shopId), o)
}

seed()

export const store = {
  /** Busca um pedido pela chave composta (orderViewId + shopId). */
  getOrder(orderViewId: number, shopId: number): OrderInfo | undefined {
    return orders.get(key(orderViewId, shopId))
  },

  /** Cria ou substitui um pedido — útil em testes/scripts do frontend. */
  upsertOrder(order: OrderInfo): void {
    orders.set(key(order.baseOrder.orderViewId, order.merchantOrder.shopId), order)
  },

  /** Atualiza só o status do pedido (10/20/35/40/50), mantendo o resto. */
  updateStatus(orderViewId: number, shopId: number, status: number): OrderInfo | undefined {
    const order = orders.get(key(orderViewId, shopId))
    if (!order) return undefined
    order.merchantOrder.status = status
    return order
  },

  /** Restaura os dados de exemplo (equivalente a reiniciar o servidor). */
  reset(): void {
    orders.clear()
    seed()
  },
}
