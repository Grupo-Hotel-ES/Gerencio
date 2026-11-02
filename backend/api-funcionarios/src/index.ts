import app from './server'

const PORT = process.env.PORT || 3335

app.listen(PORT, () => {
  console.log(`🚀 api-funcionarios rodando em http://localhost:${PORT}`)
})