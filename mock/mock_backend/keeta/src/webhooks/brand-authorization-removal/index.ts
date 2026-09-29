// src/webhooks/brand-authorization-removal/index.ts
//
// Mock do webhook: POST brandAuthorizationRemovalNotification (Event ID: 1303)
// Doc oficial: https://api-docs.mykeeta.com/apis/standard/basic/webhooks/brandauthorizationremovalnotification.md
//
// QUANDO O KEETA DISPARA ISSO NA VIDA REAL:
//   Quando o merchant revoga a autorização da MARCA INTEIRA — todas as
//   lojas daquela marca perdem acesso de uma vez. Ao receber isso, o
//   backend do vendor deve tratar o access token daquela marca como
//   inválido a partir de agora. opType é sempre 2 nesse evento.
//
// ROTA DE GATILHO DESTE MOCK:
//   POST /webhooks/trigger/brand-authorization-removal
//   Body: {
//     "targetUrl": "http://localhost:3333/webhooks/brand-authorization-removal",
//     "brandId": 4323,
//     "brandName": "GUI JI",
//     "shopIds": [145541, 145542, 145543]
//   }

import { Router, type Request, type Response } from 'express'
import { dispatchWebhook, triggerResponseBody } from '../dispatch.js'
import type { BrandAuthorizationRemovalPayload } from '../../types.js'

const router = Router()

router.post('/webhooks/trigger/brand-authorization-removal', async (req: Request, res: Response) => {
  const { targetUrl, brandId, brandName, shopIds, authId } = req.body as {
    targetUrl?: string
    brandId?: number
    brandName?: string
    shopIds?: number[]
    authId?: string
  }

  if (!targetUrl) {
    return res.status(400).json({ code: 400, message: 'Campo "targetUrl" é obrigatório.' })
  }

  const payload: BrandAuthorizationRemovalPayload = {
    appId: '3762772727',
    authId: authId ?? 'auth_20240324_003',
    createTime: Date.now(),
    brandId: brandId ?? 4323,
    brandName: brandName ?? 'GUI JI',
    shopIds: shopIds ?? [145541, 145542, 145543],
    opType: 2,
  }

  const result = await dispatchWebhook({
    targetUrl,
    eventName: 'brandAuthorizationRemovalNotification',
    payload,
  })

  const status = result.delivered ? 200 : 502
  return res.status(status).json({ ...triggerResponseBody(result), debug: result })
})

export default router
