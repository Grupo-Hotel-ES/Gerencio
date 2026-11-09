import { garantirUsuarioPadrao } from '@geroncio/shared-db'
import app from './server'

const PORT = Number(process.env.PORT) || 3003

// Primeiro acesso: admin / admin123
garantirUsuarioPadrao().catch((error) => console.error('[auth] não foi possível criar o usuário padrão:', error.message))

app.listen(PORT, () => {
  console.log(`API DE RESTAURANTES RODANDO NA PORTA ${PORT}`)
})
