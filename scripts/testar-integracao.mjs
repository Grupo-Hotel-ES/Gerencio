import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as esperar } from 'node:timers/promises'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backend = join(raiz, 'backend')
const require = createRequire(join(backend, 'package.json'))
const nome = `geroncio-testes-${randomBytes(6).toString('hex')}`
const senha = randomBytes(24).toString('hex')
const resultados = join(raiz, '.resultados-testes')
const caminhoRelatorio = join(resultados, 'integracao.tap')
const caminhoExecucao = join(resultados, 'execucao-integracao.json')
const execucao = { inicio: new Date().toISOString(), revisao: null, arvoreModificada: null, container: nome, relatorioGerado: false, resultado: 'preparando' }
let criado = false

function executar(comando, argumentos, { capturar = false, env = process.env, timeout = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const filho = spawn(comando, argumentos, {
      cwd: backend, env, shell: false,
      stdio: capturar ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      timeout,
    })
    let saida = ''
    filho.stdout?.on('data', (dados) => { saida += dados })
    filho.stderr?.on('data', (dados) => { saida += dados })
    filho.on('error', reject)
    filho.on('close', (codigo) => resolve({ codigo: codigo ?? 1, saida: saida.trim() }))
  })
}

async function exigir(comando, argumentos, opcoes) {
  const resultado = await executar(comando, argumentos, opcoes)
  if (resultado.codigo !== 0) throw new Error(`${comando} falhou (${resultado.codigo}). ${resultado.saida}`)
  return resultado.saida
}

async function listarTestes(pasta) {
  const arquivos = []
  for (const entrada of await readdir(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, entrada.name)
    if (entrada.isDirectory()) arquivos.push(...await listarTestes(caminho))
    else if (entrada.name.endsWith('.test.ts')) arquivos.push(caminho)
  }
  return arquivos.sort()
}

async function limpar() {
  if (!criado) return
  // Apenas o container novo desta execução; nenhum volume ou banco do projeto é usado.
  await exigir('docker', ['rm', '--force', '--volumes', nome], { capturar: true })
  criado = false
}

async function principal() {
  // Invalida o resultado anterior antes de qualquer etapa que possa falhar.
  await mkdir(resultados, { recursive: true })
  await rm(caminhoRelatorio, { force: true })
  await writeFile(caminhoExecucao, JSON.stringify(execucao, null, 2))
  execucao.revisao = await exigir('git', ['rev-parse', 'HEAD'], { capturar: true })
  execucao.arvoreModificada = Boolean(await exigir('git', ['status', '--porcelain'], { capturar: true }))
  if (process.argv.length > 2) throw new Error('Este comando executa a suíte completa, sem filtros.')
  const testes = await listarTestes(join(backend, 'testes'))
  if (!testes.length) throw new Error('Nenhum teste encontrado; execução recusada.')
  for (const arquivo of testes) {
    const fonte = await readFile(arquivo, 'utf8')
    if (/\.(skip|only|todo)\s*\(|\b(skip|only|todo)\s*:/.test(fonte)) {
      throw new Error(`Teste desabilitado ou exclusivo em ${arquivo}. Revise as regras de testes.`)
    }
  }
  await exigir('docker', ['info', '--format', '{{.ServerVersion}}'], { capturar: true })
  console.log(`Preparando PostgreSQL exclusivo: ${nome}`)
  await exigir('docker', [
    'run', '--detach', '--name', nome, '--label', 'geroncio.finalidade=teste',
    '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data',
    '--env', 'POSTGRES_USER=validacao', '--env', `POSTGRES_PASSWORD=${senha}`,
    '--env', 'POSTGRES_DB=geroncio_validacao_estoque', 'postgres:16-alpine',
  ], { capturar: true, timeout: 300_000 })
  criado = true
  let pronto = false
  for (let tentativa = 0; tentativa < 60; tentativa++) {
    const resultado = await executar('docker', ['exec', nome, 'pg_isready', '-U', 'validacao', '-d', 'geroncio_validacao_estoque'], { capturar: true })
    if (resultado.codigo === 0) { pronto = true; break }
    await esperar(1000)
  }
  if (!pronto) throw new Error('O banco de teste não ficou disponível em 60 segundos.')
  const endereco = await exigir('docker', ['port', nome, '5432/tcp'], { capturar: true })
  const porta = /^127\.0\.0\.1:(\d+)$/.exec(endereco)?.[1]
  if (!porta) throw new Error('O banco de teste não está publicado exclusivamente em 127.0.0.1.')
  const url = `postgresql://validacao:${senha}@127.0.0.1:${porta}/geroncio_validacao_estoque?connection_limit=5&connect_timeout=5`
  const env = {
    ...process.env,
    NODE_ENV: 'test', DATABASE_URL: url, DIRECT_URL: url,
    GERONCIO_TESTE_URL: url, GERONCIO_TESTE_PORTA: porta,
    NODE_OPTIONS: '',
    STRIPE_SECRET_KEY: 'sk_test_geroncio_sem_acesso_externo',
    STRIPE_WEBHOOK_SECRET: 'whsec_geroncio_somente_teste',
    RAPPI_WEBHOOK_SECRET: 'rappi_somente_teste', UBER_WEBHOOK_SECRET: 'uber_somente_teste',
    AUTHENTICATION_API_KEY: '', EVOLUTION_URL: 'http://127.0.0.1:1',
    IFOOD_API_URL: 'http://127.0.0.1:1', MOCK_API_URL: 'http://127.0.0.1:1',
    FUSO_HORARIO: 'America/Sao_Paulo',
  }
  const prisma = require.resolve('prisma/build/index.js')
  await exigir(process.execPath, [prisma, 'migrate', 'deploy', '--schema', 'packages/shared-db/prisma/schema.prisma'], { env })
  await exigir(process.execPath, [prisma, 'generate', '--schema', 'packages/shared-db/prisma/schema.prisma'], { env })
  const resultado = await executar(process.execPath, [
    '--import', 'tsx', '--test', '--test-concurrency=1', '--test-timeout=60000',
    '--test-reporter=spec', '--test-reporter=tap',
    '--test-reporter-destination=stdout', `--test-reporter-destination=${caminhoRelatorio}`,
    ...testes,
  ], { env, timeout: 300_000 })
  process.exitCode = resultado.codigo
  const relatorio = await readFile(caminhoRelatorio, 'utf8')
  execucao.relatorioGerado = true
  if (/# (skipped|todo|cancelled) [1-9]/.test(relatorio)) {
    console.error('A suíte contém testes ignorados, pendentes ou cancelados; resultado reprovado.')
    process.exitCode = 1
  }
  execucao.resultado = process.exitCode === 0 ? 'aprovado' : 'reprovado'
  console.log(`Relatório: ${caminhoRelatorio}`)
}

try {
  await principal()
} catch (erro) {
  execucao.resultado = 'erro_de_execucao'
  console.error(`Não foi possível concluir os testes: ${erro.message}`)
  process.exitCode = 1
} finally {
  try { await limpar() } catch (erro) {
    execucao.resultado = 'erro_de_limpeza'
    console.error(`Falha ao remover o container exclusivo ${nome}: ${erro.message}`)
    process.exitCode = 1
  }
  try {
    await writeFile(caminhoExecucao, JSON.stringify({ ...execucao, fim: new Date().toISOString(), codigoSaida: process.exitCode ?? 0 }, null, 2))
  } catch (erro) {
    console.error(`Falha ao registrar a execução: ${erro.message}`)
    process.exitCode = 1
  }
}
