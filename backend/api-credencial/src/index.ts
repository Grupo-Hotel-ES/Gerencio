import app from './server'

const PORT = Number(process.env.PORT) || 3004

app.listen(PORT, () => {
  console.log(`API DE CREDENCIAIS RODANDO NA PORTA ${PORT}`)
})