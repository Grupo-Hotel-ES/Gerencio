// api-restaurantes/src/server.ts
import express, { type ErrorRequestHandler } from 'express'
import { exigirLoginPublico } from '@geroncio/shared-db'
import routes from './routes'
import conta from './conta'

const app = express()

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// CORS
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
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'api-restaurantes' })
})

// Login: obrigatório para quem chega pela internet (nginx); chamadas internas passam direto
app.use(exigirLoginPublico({ livres: ['/api/auth/login', '/api/restaurante/marca'] }))

// Rotas
app.use('/api', routes)
app.use('/api', conta)

// Rota não encontrada
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' })
})

// Tratamento de erros
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal Server Error' })
}
app.use(errorHandler)

export default app
