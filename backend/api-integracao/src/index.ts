import app from './server'

const PORT = Number(process.env.PORT) || 3005

app.listen(PORT, () => {
  console.log(`API DE INTEGRAÇÃO RODANDO NA PORTA ${PORT}`)
})
