import assert from 'node:assert/strict'

// Importar antes de qualquer serviço/Prisma. Executar pela raiz: pnpm test:integracao.
const url = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/ausente')
assert.equal(process.env.NODE_ENV, 'test', 'Use o executor de integração, com ambiente de teste')
assert.equal(process.env.DATABASE_URL, process.env.GERONCIO_TESTE_URL, 'A URL deve ser criada pelo executor')
assert.equal(url.protocol, 'postgresql:')
assert.equal(url.hostname, '127.0.0.1', 'Banco de teste deve ser local')
assert.equal(url.port, process.env.GERONCIO_TESTE_PORTA, 'Porta deve pertencer ao container de teste')
assert.ok(url.port && !['5432', '5433'].includes(url.port), 'Não utilizar as portas dos bancos do projeto')
assert.equal(url.pathname, '/geroncio_validacao_estoque')
assert.equal(url.username, 'validacao')
assert.match(url.password, /^[0-9a-f]{48}$/, 'Senha deve ser temporária, criada pelo executor')

export const segredoStripe = 'whsec_geroncio_somente_teste'
assert.equal(process.env.STRIPE_WEBHOOK_SECRET, segredoStripe)
assert.equal(process.env.STRIPE_SECRET_KEY, 'sk_test_geroncio_sem_acesso_externo')
