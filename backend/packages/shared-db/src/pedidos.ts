import { Prisma, StatusPedido } from '@prisma/client'

export class ErroOperacao extends Error {
  constructor(public readonly status: number, mensagem: string) {
    super(mensagem)
  }
}

/** Consolida produtos repetidos e valida os itens antes de gravar qualquer pedido. */
export async function prepararItensPedido(tx: Prisma.TransactionClient, entrada: unknown, restauranteInformado?: number) {
  if (!Array.isArray(entrada) || entrada.length === 0) {
    throw new ErroOperacao(400, 'O pedido deve conter ao menos um item')
  }
  const quantidades = new Map<number, number>()
  for (const item of entrada) {
    const produtoId = Number(item?.produtoId)
    const quantidade = Number(item?.quantidade)
    if (!Number.isSafeInteger(produtoId) || produtoId <= 0 || !Number.isSafeInteger(quantidade) || quantidade <= 0) {
      throw new ErroOperacao(400, 'Cada item deve ter produtoId válido e quantidade inteira positiva')
    }
    const total = (quantidades.get(produtoId) ?? 0) + quantidade
    if (total > 1_000_000) throw new ErroOperacao(400, 'Quantidade do item acima do limite')
    quantidades.set(produtoId, total)
  }
  const produtos = await tx.produto.findMany({ where: { id: { in: [...quantidades.keys()] } } })
  if (produtos.length !== quantidades.size) throw new ErroOperacao(400, 'Um dos produtos não existe')
  const restauranteId = produtos[0]!.restauranteId
  if (produtos.some((produto) => produto.restauranteId !== restauranteId) ||
      (restauranteInformado !== undefined && restauranteInformado !== restauranteId)) {
    throw new ErroOperacao(400, 'Todos os produtos devem pertencer ao restaurante do pedido')
  }
  const itens = produtos.map((produto) => ({ produtoId: produto.id, quantidade: quantidades.get(produto.id)! }))
  const preco = produtos.reduce((total, produto) =>
    total.plus(produto.preco.mul(quantidades.get(produto.id)!)), new Prisma.Decimal(0))
  return { restauranteId, itens, preco }
}

const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  novo: ['em_preparo', 'cancelado'],
  em_preparo: ['pronto', 'cancelado'],
  pronto: ['saiu_para_entrega', 'cancelado'],
  saiu_para_entrega: ['entregue'],
  entregue: [],
  cancelado: [],
}

/** Aceite e baixa, ou cancelamento e devolução, são confirmados na mesma transação. */
export async function mudarStatusPedido(tx: Prisma.TransactionClient, id: number, status: StatusPedido) {
  const pedido = await tx.pedido.findUnique({ where: { id }, include: { itens: true } })
  if (!pedido) throw new ErroOperacao(404, 'Pedido não encontrado')
  if (pedido.status === status) return
  if (!TRANSICOES[pedido.status].includes(status)) {
    throw new ErroOperacao(409, `Não é possível mudar de ${pedido.status} para ${status}`)
  }
  const baixar = status === 'em_preparo' && !pedido.estoqueBaixado
  const devolver = status === 'cancelado' && pedido.estoqueBaixado
  const alterado = await tx.pedido.updateMany({
    where: { id, status: pedido.status, estoqueBaixado: pedido.estoqueBaixado },
    data: { status, estoqueBaixado: baixar ? true : devolver ? false : pedido.estoqueBaixado },
  })
  if (alterado.count !== 1) throw new ErroOperacao(409, 'O pedido foi alterado. Atualize a lista e tente novamente')

  // A ordem fixa reduz a disputa por produtos entre pedidos concorrentes.
  for (const item of [...pedido.itens].sort((a, b) => a.produtoId - b.produtoId)) {
    if (!Number.isSafeInteger(item.quantidade) || item.quantidade <= 0) {
      throw new ErroOperacao(409, 'O pedido possui uma quantidade inválida')
    }
    if (baixar) {
      const baixa = await tx.produto.updateMany({
        where: { id: item.produtoId, quantidade: { gte: item.quantidade } },
        data: { quantidade: { decrement: item.quantidade }, versaoEstoque: { increment: 1 } },
      })
      if (baixa.count !== 1) {
        const produto = await tx.produto.findUnique({ where: { id: item.produtoId } })
        throw new ErroOperacao(409, `Estoque insuficiente de ${produto?.nome ?? `produto ${item.produtoId}`}. Ajuste o saldo antes de aceitar`)
      }
    } else if (devolver) {
      await tx.produto.update({
        where: { id: item.produtoId },
        data: { quantidade: { increment: item.quantidade }, versaoEstoque: { increment: 1 } },
      })
    }
  }
}
