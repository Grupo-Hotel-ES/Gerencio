import app from './server'

const PORT = Number(process.env.PORT) || 3001

app.listen(PORT, () => {
  console.log(`API DE CLIENTES RODANDO NA PORTA ${PORT}`)
})
