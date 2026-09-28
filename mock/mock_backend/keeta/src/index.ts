gitg// src/index.ts
//
// Ponto de entrada: sobe o servidor do mock Keeta.

import app from './server.js'

const PORT = process.env.PORT || 4001

app.listen(PORT, () => {
  console.log(`🎭 mock-keeta rodando em http://localhost:${PORT}`)
  console.log(`   Health check:        GET  http://localhost:${PORT}/health`)
  console.log(`   Consultar pedido:    POST http://localhost:${PORT}/order/get`)
  console.log(`   Disparar webhooks:   POST http://localhost:${PORT}/webhooks/trigger/...`)
})
