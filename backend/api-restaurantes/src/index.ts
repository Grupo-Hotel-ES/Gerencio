import app from './server'

const PORT = Number(process.env.PORT) || 3003

app.listen(PORT, () => {
  console.log(`API DE RESTAURANTES RODANDO NA PORTA ${PORT}`)
})
