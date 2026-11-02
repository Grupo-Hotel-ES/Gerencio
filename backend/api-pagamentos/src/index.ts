import app from './server'

const PORT = Number(process.env.PORT) || 3006

app.listen(PORT, () => {
  console.log(`API DE PAGAMENTOS RODANDO NA PORTA ${PORT}`)
})
