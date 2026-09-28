// src/order/index.ts
//
// Mock da rota real do Keeta: POST /order/get
// Doc oficial: https://api-docs.mykeeta.com/apis/standard/order
//
// O QUE ESSA ROTA FAZ NA VIDA REAL:
//   O sistema do restaurante (terceiro) chama o Keeta para buscar os
//   detalhes completos de um pedido específico, dado o orderViewId
//   (id do pedido) e o shopId (id da loja no Keeta).
//
// O QUE ESSE MOCK FAZ:
//   Em vez de bater na API de verdade do Keeta, devolve dados fixos/
//   simulados guardados em `store.ts`, com o MESMO formato de resposta
//   documentado (envelope { code, message, data }). Assim o frontend
//   pode ser desenvolvido e testado sem depender de credenciais reais
//   do Keeta nem de pedidos de verdade.
//
// COMO USAR (do frontend):
//   POST http://localhost:PORT/order/get
//   Content-Type: application/json
//   { "orderViewId": 756823555555859, "shopId": 466663 }
//
// Esses são o orderViewId/shopId do pedido de exemplo já cadastrado em
// store.ts (seedOrder). Para simular "pedido não encontrado", chame com
// qualquer outro par de valores.

import { Router, type Request, type Response } from 'express'
import { store } from '../store.js'
import type { OrderGetRequest, OrderGetResponse } from '../types.js'

const router = Router()

router.post('/order/get', (req: Request, res: Response) => {
  const { orderViewId, shopId } = req.body as Partial<OrderGetRequest>

  // Validação básica dos campos obrigatórios, igual a API real faria.
  if (typeof orderViewId !== 'number' || typeof shopId !== 'number') {
    const body: OrderGetResponse = {
      code: 400,
      message: 'orderViewId e shopId são obrigatórios e devem ser números.',
    }
    return res.status(400).json(body)
  }

  const orderInfo = store.getOrder(orderViewId, shopId)

  if (!orderInfo) {
    // Código de erro ilustrativo — a doc real do Keeta não detalha os
    // códigos de erro possíveis dessa rota, então usamos um valor não-zero
    // qualquer para sinalizar falha, seguindo o padrão "code !== 0 = erro".
    const body: OrderGetResponse = {
      code: 404,
      message: `Pedido não encontrado para orderViewId=${orderViewId} e shopId=${shopId}.`,
    }
    return res.status(404).json(body)
  }

  const body: OrderGetResponse = {
    code: 0,
    message: 'Success',
    data: { orderInfo },
  }

  return res.status(200).json(body)
})

export default router
