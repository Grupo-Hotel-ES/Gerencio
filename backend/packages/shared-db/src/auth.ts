import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { PapelUsuario } from '@prisma/client'
import { db } from './client'

// Segredo que assina os tokens. Em produção, defina AUTH_SECRET (openssl rand -hex 32)
// igual em todas as APIs; sem ele, os tokens valem só para desenvolvimento.
const SEGREDO = process.env.AUTH_SECRET || 'geroncio-dev-inseguro'
if (!process.env.AUTH_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[auth] AUTH_SECRET não definido: usando o segredo de desenvolvimento')
}

const VALIDADE_TOKEN_MS = 7 * 24 * 60 * 60 * 1000

// Requisições vindas da internet passam pelo nginx, que adiciona este cabeçalho.
// Chamadas internas (chatbot no compose) e o desenvolvimento local não o têm.
export const CABECALHO_PUBLICO = 'x-geroncio-publico'

export type SessaoToken = { usuarioId: number; papel: PapelUsuario; expiraEm: number }

/** Hash da senha no formato scrypt$<salt>$<hash>, ambos em hex. */
export function gerarHashSenha(senha: string) {
  const salt = randomBytes(16).toString('hex')
  return `scrypt$${salt}$${scryptSync(senha, salt, 64).toString('hex')}`
}

export function conferirSenha(senha: string, hashSalvo: string) {
  const [algoritmo, salt, hash] = hashSalvo.split('$')
  if (algoritmo !== 'scrypt' || !salt || !hash) return false
  const esperado = Buffer.from(hash, 'hex')
  const calculado = scryptSync(senha, salt, esperado.length)
  return timingSafeEqual(esperado, calculado)
}

function assinar(conteudo: string) {
  return createHmac('sha256', SEGREDO).update(conteudo).digest('base64url')
}

/** Token no formato <dados em base64url>.<assinatura HMAC>. */
export function gerarToken(usuarioId: number, papel: PapelUsuario) {
  const sessao: SessaoToken = { usuarioId, papel, expiraEm: Date.now() + VALIDADE_TOKEN_MS }
  const conteudo = Buffer.from(JSON.stringify(sessao)).toString('base64url')
  return `${conteudo}.${assinar(conteudo)}`
}

/** Devolve a sessão do token, ou null se a assinatura não bater ou se ele já expirou. */
export function lerToken(token: string | undefined): SessaoToken | null {
  if (!token) return null
  const [conteudo, assinatura] = token.split('.')
  if (!conteudo || !assinatura) return null
  const esperada = Buffer.from(assinar(conteudo))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null
  try {
    const sessao = JSON.parse(Buffer.from(conteudo, 'base64url').toString()) as SessaoToken
    return sessao.expiraEm > Date.now() ? sessao : null
  } catch {
    return null
  }
}

/** Lê o token do cabeçalho Authorization: Bearer <token>. */
export function sessaoDaRequisicao(req: { headers: Record<string, string | string[] | undefined> }) {
  const cabecalho = req.headers.authorization
  const valor = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho
  return lerToken(valor?.startsWith('Bearer ') ? valor.slice(7) : undefined)
}

/**
 * Middleware: exige login nas requisições que vêm da internet (pelo nginx).
 * `livres` são caminhos públicos, como o login, o health e os webhooks.
 */
export function exigirLoginPublico({ livres = [] }: { livres?: (string | RegExp)[] } = {}) {
  return (req: any, res: any, next: () => void) => {
    if (!req.headers[CABECALHO_PUBLICO] || req.method === 'OPTIONS') return next()
    const caminho: string = req.path
    if (caminho === '/health' || livres.some((l) => (typeof l === 'string' ? l === caminho : l.test(caminho)))) {
      return next()
    }
    if (!sessaoDaRequisicao(req)) {
      res.status(401).json({ error: 'Sessão expirada. Entre novamente.' })
      return
    }
    next()
  }
}

/** Cria o acesso padrão (admin / admin123) quando ainda não há nenhum usuário. */
export async function garantirUsuarioPadrao() {
  if ((await db.usuario.count()) > 0) return
  await db.usuario.create({
    data: { nome: 'Administrador', login: 'admin', papel: PapelUsuario.administrador, senhaHash: gerarHashSenha('admin123') },
  })
  console.log('[auth] usuário padrão criado: admin / admin123 (troque a senha em Configurações)')
}
