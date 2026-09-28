// src/server.ts
//
// Monta o app Express juntando cada rota mock (um arquivo index.ts por
// funcionalidade, como pedido pelo time). Não dá listen() aqui — só
// configura. Quem sobe o servidor de verdade é o index.ts na raiz.

import express, { type ErrorRequestHandler } from 'express'
import orderRoutes from './order/index.js'
import oauth2AuthorizationCodeWebhook from './webhooks/oauth2-authorization-code/index.js'
import storeAuthorizationWebhook from './webhooks/store-authorization/index.js'
import storeAuthorizationRemovalWebhook from './webhooks/store-authorization-removal/index.js'
import brandAuthorizationRemovalWebhook from './webhooks/brand-authorization-removal/index.js'
import { store } from './store.js'

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// CORS — mesmo padrão usado no restante do backend.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', service: 'mock-keeta' })
})

// Rota utilitária de desenvolvimento: reseta os dados de exemplo para o
// estado inicial (útil entre uma rodada de testes e outra).
app.post('/mock/reset', (_req, res) => {
  store.reset()
  res.json({ code: 0, message: 'Dados de exemplo restaurados.' })
})

// Rotas "reais" (o frontend chama estas como se fossem o Keeta de verdade)
app.use(orderRoutes)

// Rotas de gatilho de webhook (disparam a notificação para o SEU backend)
app.use(oauth2AuthorizationCodeWebhook)
app.use(storeAuthorizationWebhook)
app.use(storeAuthorizationRemovalWebhook)
app.use(brandAuthorizationRemovalWebhook)

// Rota não encontrada
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada', path: req.path })
})

// Tratamento de erros
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal Server Error' })
}
app.use(errorHandler)

export default app
