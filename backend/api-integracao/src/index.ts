import app from './server'
import { iniciarProcessadorEventos } from './processador-eventos'
import { iniciarSincronizadorEstoque } from './sincronizador-estoque'

const PORT = Number(process.env.PORT) || 3005

app.listen(PORT, () => {
  console.log(`API DE INTEGRAÇÃO RODANDO NA PORTA ${PORT}`)
  iniciarProcessadorEventos()
  iniciarSincronizadorEstoque()
})
