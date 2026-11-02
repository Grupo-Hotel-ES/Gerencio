import { Router } from 'express'
import {
  db,
  parseId,
  PapelUsuario,
  Prisma,
  conferirSenha,
  gerarHashSenha,
  gerarToken,
  obterRestaurantePrincipal,
  sessaoDaRequisicao,
  type SessaoToken,
  type Usuario,
} from '@geroncio/shared-db'
import { extrairCamposEntrega } from './routes'

const routes = Router()

const LOGIN_VALIDO = /^[a-z0-9._-]{3,32}$/
const TAMANHO_MINIMO_SENHA = 6

function usuarioPublico(usuario: Usuario) {
  const { senhaHash: _, ...resto } = usuario
  return resto
}

/** Restaurante no formato da tela de Configurações (Decimal vira número). */
function restaurantePublico(r: Awaited<ReturnType<typeof obterRestaurantePrincipal>>) {
  return {
    id: r.id,
    nome: r.nome,
    razaoSocial: r.razaoSocial,
    cnpj: r.cnpj,
    categoria: r.categoria,
    telefone: r.telefone,
    email: r.email,
    cep: r.cep,
    cidade: r.cidade,
    uf: r.uf,
    logradouro: r.logradouro,
    numero: r.numero,
    complemento: r.complemento,
    bairro: r.bairro,
    configuracoes: r.configuracoes,
    taxaEntregaBase: Number(r.taxaEntregaBase),
    kmInclusosTaxaBase: r.kmInclusosTaxaBase,
    custoPorKmAdicional: Number(r.custoPorKmAdicional),
    distanciaMaximaKm: r.distanciaMaximaKm,
    latitude: r.latitude,
    longitude: r.longitude,
  }
}

/** Sessão válida e usuário ainda ativo; responde 401/403 e devolve null quando não pode seguir. */
async function exigirUsuario(req: any, res: any, papeis?: PapelUsuario[]) {
  const sessao: SessaoToken | null = sessaoDaRequisicao(req)
  const usuario = sessao && (await db.usuario.findUnique({ where: { id: sessao.usuarioId } }))
  if (!usuario || !usuario.ativo) {
    res.status(401).json({ error: 'Sessão expirada. Entre novamente.' })
    return null
  }
  if (papeis && !papeis.includes(usuario.papel)) {
    res.status(403).json({ error: 'Seu acesso não permite esta ação' })
    return null
  }
  return usuario
}

function erroInterno(res: any, error: any, mensagem: string) {
  res.status(500).json({ error: mensagem, detalhe: error.message })
}

// ============================================
// AUTENTICAÇÃO
// ============================================

// 1. ENTRAR
routes.post('/auth/login', async (req, res) => {
  const login = String(req.body?.login ?? '').trim().toLowerCase()
  const senha = String(req.body?.senha ?? '')
  if (!login || !senha) {
    res.status(400).json({ error: 'Informe usuário e senha' })
    return
  }

  try {
    const usuario = await db.usuario.findUnique({ where: { login } })
    // Mesma mensagem para usuário inexistente e senha errada
    if (!usuario || !usuario.ativo || !conferirSenha(senha, usuario.senhaHash)) {
      res.status(401).json({ error: 'Usuário ou senha incorretos' })
      return
    }
    res.json({ token: gerarToken(usuario.id, usuario.papel), usuario: usuarioPublico(usuario) })
  } catch (error: any) {
    erroInterno(res, error, 'Erro ao entrar')
  }
})

// 2. USUÁRIO DA SESSÃO
routes.get('/auth/eu', async (req, res) => {
  try {
    const usuario = await exigirUsuario(req, res)
    if (usuario) res.json(usuarioPublico(usuario))
  } catch (error: any) {
    erroInterno(res, error, 'Erro ao buscar a sessão')
  }
})

// ============================================
// RESTAURANTE (único: o app é whitelabel)
// ============================================

// 3. NOME DO RESTAURANTE (público, para a tela de login)
routes.get('/restaurante/marca', async (req, res) => {
  try {
    const restaurante = await obterRestaurantePrincipal()
    res.json({ nome: restaurante.nome })
  } catch (error: any) {
    erroInterno(res, error, 'Erro ao buscar o restaurante')
  }
})

// 4. DADOS DO RESTAURANTE
routes.get('/restaurante', async (req, res) => {
  try {
    if (!(await exigirUsuario(req, res))) return
    res.json(restaurantePublico(await obterRestaurantePrincipal()))
  } catch (error: any) {
    erroInterno(res, error, 'Erro ao buscar o restaurante')
  }
})

// 5. ATUALIZAR RESTAURANTE (administrador ou gerente)
// `configuracoes` é mesclada por seção (operacao, preferencias...), para cada aba salvar só a sua.
routes.patch('/restaurante', async (req, res) => {
  const corpo = req.body ?? {}
  const textos = ['nome', 'razaoSocial', 'cnpj', 'categoria', 'telefone', 'email', 'cep', 'cidade', 'uf', 'logradouro', 'numero', 'complemento', 'bairro'] as const
  const dados: Record<string, string> = {}
  for (const campo of textos) {
    if (corpo[campo] === undefined) continue
    if (typeof corpo[campo] !== 'string') {
      res.status(400).json({ error: `${campo} deve ser texto` })
      return
    }
    dados[campo] = corpo[campo].trim()
  }
  if (dados.nome !== undefined && !dados.nome) {
    res.status(400).json({ error: 'O nome do restaurante é obrigatório' })
    return
  }
  if (corpo.configuracoes !== undefined && (typeof corpo.configuracoes !== 'object' || Array.isArray(corpo.configuracoes) || corpo.configuracoes === null)) {
    res.status(400).json({ error: 'configuracoes deve ser um objeto' })
    return
  }
  const entrega = extrairCamposEntrega(corpo)
  if (entrega.erro) {
    res.status(400).json({ error: entrega.erro })
    return
  }

  try {
    if (!(await exigirUsuario(req, res, [PapelUsuario.administrador, PapelUsuario.gerente]))) return
    const atual = await obterRestaurantePrincipal()

    const novo = { ...atual, ...dados }
    const enderecoMudou = ['logradouro', 'numero', 'cep', 'cidade', 'uf'].some(
      (campo) => dados[campo] !== undefined && dados[campo] !== (atual as any)[campo],
    )
    const configuracoes = corpo.configuracoes
      ? { ...(atual.configuracoes as Record<string, unknown>), ...corpo.configuracoes }
      : undefined

    const restaurante = await db.restaurante.update({
      where: { id: atual.id },
      data: {
        ...dados,
        // `endereco` é o texto usado para localizar o restaurante no mapa (frete e rotas)
        endereco: [novo.logradouro, novo.numero].filter(Boolean).join(', '),
        ...entrega.dados,
        ...(configuracoes && { configuracoes: configuracoes as Prisma.InputJsonValue }),
        // Endereço novo: as coordenadas antigas deixam de valer e são buscadas de novo no próximo frete
        ...(enderecoMudou && entrega.dados?.latitude === undefined && { latitude: null, longitude: null }),
      },
    })
    res.json(restaurantePublico(restaurante))
  } catch (error: any) {
    if (error?.code === 'P2002') {
      res.status(409).json({ error: 'CNPJ já cadastrado' })
      return
    }
    erroInterno(res, error, 'Erro ao salvar o restaurante')
  }
})

// ============================================
// USUÁRIOS
// ============================================

// 6. ATUALIZAR OS PRÓPRIOS DADOS
routes.patch('/usuarios/eu', async (req, res) => {
  const { nome, email, telefone } = req.body ?? {}
  if (nome !== undefined && (typeof nome !== 'string' || !nome.trim())) {
    res.status(400).json({ error: 'O nome é obrigatório' })
    return
  }
  try {
    const usuario = await exigirUsuario(req, res)
    if (!usuario) return
    const atualizado = await db.usuario.update({
      where: { id: usuario.id },
      data: {
        ...(nome !== undefined && { nome: nome.trim() }),
        ...(typeof email === 'string' && { email: email.trim() }),
        ...(typeof telefone === 'string' && { telefone: telefone.trim() }),
      },
    })
    res.json(usuarioPublico(atualizado))
  } catch (error: any) {
    erroInterno(res, error, 'Erro ao salvar seus dados')
  }
})

// 7. TROCAR A PRÓPRIA SENHA
routes.post('/usuarios/eu/senha', async (req, res) => {
  const { senhaAtual, novaSenha } = req.body ?? {}
  if (typeof novaSenha !== 'string' || novaSenha.length < TAMANHO_MINIMO_SENHA) {
    res.status(400).json({ error: `A nova senha precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres` })
    return
  }
  try {
    const usuario = await exigirUsuario(req, res)
    if (!usuario) return
    if (!conferirSenha(String(senhaAtual ?? ''), usuario.senhaHash)) {
      res.status(400).json({ error: 'A senha atual não confere' })
      return
    }
    await db.usuario.update({ where: { id: usuario.id }, data: { senhaHash: gerarHashSenha(novaSenha) } })
    res.status(204).end()
  } catch (error: any) {
    erroInterno(res, error, 'Erro ao trocar a senha')
  }
})

// 8. LISTAR USUÁRIOS (administrador)
routes.get('/usuarios', async (req, res) => {
  try {
    if (!(await exigirUsuario(req, res, [PapelUsuario.administrador]))) return
    const usuarios = await db.usuario.findMany({ orderBy: { nome: 'asc' } })
    res.json(usuarios.map(usuarioPublico))
  } catch (error: any) {
    erroInterno(res, error, 'Erro ao listar usuários')
  }
})

// 9. CADASTRAR USUÁRIO (administrador)
routes.post('/usuarios', async (req, res) => {
  const { nome, email = '', telefone = '', papel = PapelUsuario.operador, senha } = req.body ?? {}
  const login = String(req.body?.login ?? '').trim().toLowerCase()
  if (typeof nome !== 'string' || !nome.trim()) {
    res.status(400).json({ error: 'O nome é obrigatório' })
    return
  }
  if (!LOGIN_VALIDO.test(login)) {
    res.status(400).json({ error: 'O usuário deve ter de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado' })
    return
  }
  if (!Object.values(PapelUsuario).includes(papel)) {
    res.status(400).json({ error: `papel deve ser um de: ${Object.values(PapelUsuario).join(', ')}` })
    return
  }
  if (typeof senha !== 'string' || senha.length < TAMANHO_MINIMO_SENHA) {
    res.status(400).json({ error: `A senha precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres` })
    return
  }

  try {
    if (!(await exigirUsuario(req, res, [PapelUsuario.administrador]))) return
    const usuario = await db.usuario.create({
      data: { nome: nome.trim(), login, email: String(email).trim(), telefone: String(telefone).trim(), papel, senhaHash: gerarHashSenha(senha) },
    })
    res.status(201).json(usuarioPublico(usuario))
  } catch (error: any) {
    if (error?.code === 'P2002') {
      res.status(409).json({ error: `O usuário "${login}" já existe` })
      return
    }
    erroInterno(res, error, 'Erro ao cadastrar usuário')
  }
})

/** Bloqueia mudanças que deixariam o painel sem nenhum administrador ativo. */
async function deixariaSemAdministrador(alvo: Usuario, mudanca: { papel?: PapelUsuario; ativo?: boolean; removido?: boolean }) {
  const eraAdminAtivo = alvo.papel === PapelUsuario.administrador && alvo.ativo
  const continuaAdminAtivo = !mudanca.removido &&
    (mudanca.papel ?? alvo.papel) === PapelUsuario.administrador && (mudanca.ativo ?? alvo.ativo)
  if (!eraAdminAtivo || continuaAdminAtivo) return false
  const outros = await db.usuario.count({ where: { papel: PapelUsuario.administrador, ativo: true, id: { not: alvo.id } } })
  return outros === 0
}

// 10. EDITAR USUÁRIO (administrador): nome, contato, papel, ativo ou nova senha
routes.patch('/usuarios/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }
  const { nome, email, telefone, papel, ativo, senha } = req.body ?? {}
  if (papel !== undefined && !Object.values(PapelUsuario).includes(papel)) {
    res.status(400).json({ error: `papel deve ser um de: ${Object.values(PapelUsuario).join(', ')}` })
    return
  }
  if (senha !== undefined && (typeof senha !== 'string' || senha.length < TAMANHO_MINIMO_SENHA)) {
    res.status(400).json({ error: `A senha precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres` })
    return
  }
  if (nome !== undefined && (typeof nome !== 'string' || !nome.trim())) {
    res.status(400).json({ error: 'O nome é obrigatório' })
    return
  }

  try {
    if (!(await exigirUsuario(req, res, [PapelUsuario.administrador]))) return
    const alvo = await db.usuario.findUnique({ where: { id } })
    if (!alvo) {
      res.status(404).json({ error: 'Usuário não encontrado' })
      return
    }
    if (await deixariaSemAdministrador(alvo, { papel, ativo: typeof ativo === 'boolean' ? ativo : undefined })) {
      res.status(409).json({ error: 'É preciso manter ao menos um administrador ativo' })
      return
    }
    const usuario = await db.usuario.update({
      where: { id },
      data: {
        ...(nome !== undefined && { nome: nome.trim() }),
        ...(typeof email === 'string' && { email: email.trim() }),
        ...(typeof telefone === 'string' && { telefone: telefone.trim() }),
        ...(papel !== undefined && { papel }),
        ...(typeof ativo === 'boolean' && { ativo }),
        ...(senha !== undefined && { senhaHash: gerarHashSenha(senha) }),
      },
    })
    res.json(usuarioPublico(usuario))
  } catch (error: any) {
    erroInterno(res, error, 'Erro ao editar usuário')
  }
})

// 11. REMOVER USUÁRIO (administrador; não remove a si mesmo)
routes.delete('/usuarios/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }
  try {
    const eu = await exigirUsuario(req, res, [PapelUsuario.administrador])
    if (!eu) return
    if (eu.id === id) {
      res.status(409).json({ error: 'Você não pode remover o próprio acesso' })
      return
    }
    const alvo = await db.usuario.findUnique({ where: { id } })
    if (!alvo) {
      res.status(404).json({ error: 'Usuário não encontrado' })
      return
    }
    if (await deixariaSemAdministrador(alvo, { removido: true })) {
      res.status(409).json({ error: 'É preciso manter ao menos um administrador ativo' })
      return
    }
    await db.usuario.delete({ where: { id } })
    res.status(204).end()
  } catch (error: any) {
    erroInterno(res, error, 'Erro ao remover usuário')
  }
})

export default routes
