import { Router } from 'express'
import { db, parseId, textoOuNulo, type Prisma } from '@geroncio/shared-db'

const routes = Router()

// Campos de texto opcionais: ausente mantém, vazio apaga
function opcional(valor: unknown) {
  return valor === undefined ? undefined : textoOuNulo(valor)
}

// 1. LISTAR CLIENTES
// Filtros: ?telefone=5511999999999 (exato), ?nome=...&endereco=... (iguais, sem diferenciar
// maiúsculas; com os dois, encontra quem tem um OU outro) e ?busca=... (contém, em nome,
// endereço ou telefone). Cada cliente vem com a quantidade de pedidos.
routes.get('/clientes', async (req, res) => {
  const telefone = textoOuNulo(req.query.telefone)
  const nome = textoOuNulo(req.query.nome)
  const endereco = textoOuNulo(req.query.endereco)
  const busca = textoOuNulo(req.query.busca)

  const condicoes: Prisma.ClienteWhereInput[] = []
  if (telefone) condicoes.push({ telefone })
  const iguais: Prisma.ClienteWhereInput[] = []
  if (nome) iguais.push({ nomeCliente: { equals: nome, mode: 'insensitive' } })
  if (endereco) iguais.push({ endereco: { equals: endereco, mode: 'insensitive' } })
  if (iguais.length > 0) condicoes.push({ OR: iguais })
  if (busca) {
    condicoes.push({
      OR: [
        { nomeCliente: { contains: busca, mode: 'insensitive' } },
        { endereco: { contains: busca, mode: 'insensitive' } },
        { telefone: { contains: busca } },
      ],
    })
  }

  try {
    const clientes = await db.cliente.findMany({
      where: { AND: condicoes },
      include: { _count: { select: { pedidos: true } } },
      orderBy: [{ nomeCliente: 'asc' }, { id: 'asc' }],
    })
    res.json(clientes)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao buscar clientes', detalhe: error.message })
  }
})

// 2. BUSCAR CLIENTE POR ID (com os pedidos)
routes.get('/clientes/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  try {
    const cliente = await db.cliente.findUnique({
      where: { id },
      include: { pedidos: { orderBy: { id: 'desc' } } },
    })
    if (!cliente) {
      res.status(404).json({ error: 'Cliente não encontrado' })
      return
    }
    res.json(cliente)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao buscar cliente', detalhe: error.message })
  }
})

// 3. CRIAR CLIENTE
routes.post('/clientes', async (req, res) => {
  const { nomeCliente, endereco, telefone, email, cpf } = req.body ?? {}
  const nome = textoOuNulo(nomeCliente)
  const enderecoCliente = textoOuNulo(endereco)

  if (!nome || !enderecoCliente) {
    res.status(400).json({ error: 'nomeCliente e endereco são obrigatórios' })
    return
  }

  try {
    const cliente = await db.cliente.create({
      data: {
        nomeCliente: nome,
        endereco: enderecoCliente,
        telefone: textoOuNulo(telefone),
        email: textoOuNulo(email),
        cpf: textoOuNulo(cpf),
      },
    })
    res.status(201).json(cliente)
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Já existe um cliente com esse CPF' })
      return
    }
    res.status(500).json({ error: 'Erro ao criar cliente', detalhe: error.message })
  }
})

// 4. ATUALIZAR CLIENTE
routes.put('/clientes/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const { nomeCliente, endereco, telefone, email, cpf } = req.body ?? {}
  if ((nomeCliente !== undefined && !textoOuNulo(nomeCliente)) || (endereco !== undefined && !textoOuNulo(endereco))) {
    res.status(400).json({ error: 'nomeCliente e endereco não podem ficar vazios' })
    return
  }

  try {
    const clienteExistente = await db.cliente.findUnique({ where: { id } })
    if (!clienteExistente) {
      res.status(404).json({ error: 'Cliente não encontrado' })
      return
    }

    const clienteAtualizado = await db.cliente.update({
      where: { id },
      data: {
        nomeCliente: nomeCliente === undefined ? undefined : textoOuNulo(nomeCliente)!,
        endereco: endereco === undefined ? undefined : textoOuNulo(endereco)!,
        telefone: opcional(telefone),
        email: opcional(email),
        cpf: opcional(cpf),
      },
    })
    res.json(clienteAtualizado)
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Já existe um cliente com esse CPF' })
      return
    }
    res.status(500).json({ error: 'Erro ao atualizar cliente', detalhe: error.message })
  }
})

// 5. EXCLUIR CLIENTE (só sem pedidos: os pedidos apontam para o cliente)
routes.delete('/clientes/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  try {
    const clienteExistente = await db.cliente.findUnique({
      where: { id },
      include: { _count: { select: { pedidos: true } } },
    })
    if (!clienteExistente) {
      res.status(404).json({ error: 'Cliente não encontrado' })
      return
    }
    if (clienteExistente._count.pedidos > 0) {
      res.status(409).json({ error: 'O cliente tem pedidos e não pode ser excluído' })
      return
    }

    await db.cliente.delete({ where: { id } })
    res.status(204).send()
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao excluir cliente', detalhe: error.message })
  }
})

export default routes
