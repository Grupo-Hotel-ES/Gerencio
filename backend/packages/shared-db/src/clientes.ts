import type { Cliente, Prisma } from '@prisma/client'
import { ErroOperacao } from './pedidos'

/** Dados do cliente informados ao criar um pedido. */
export interface DadosClientePedido {
  nome: string
  endereco: string
  telefone?: string | null
}

/** Remove espaços nas pontas; texto vazio vira null. */
export function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

/**
 * Cliente do pedido: com `clienteId`, usa o cadastro existente; senão, reaproveita
 * quem tem o mesmo nome e endereço (sem diferenciar maiúsculas) ou cadastra um novo.
 * Um telefone informado preenche o cadastro que ainda não tinha telefone.
 */
export async function obterOuCriarCliente(
  tx: Prisma.TransactionClient,
  clienteId: number | null,
  dados: DadosClientePedido | null,
): Promise<Cliente | null> {
  const telefone = textoOuNulo(dados?.telefone)

  if (clienteId !== null) {
    const cliente = await tx.cliente.findUnique({ where: { id: clienteId } })
    if (!cliente) throw new ErroOperacao(400, 'Cliente não encontrado')
    if (telefone && !cliente.telefone) {
      return tx.cliente.update({ where: { id: cliente.id }, data: { telefone } })
    }
    return cliente
  }

  const nome = textoOuNulo(dados?.nome)
  const endereco = textoOuNulo(dados?.endereco)
  if (!nome || !endereco) return null

  const existente = await tx.cliente.findFirst({
    where: {
      nomeCliente: { equals: nome, mode: 'insensitive' },
      endereco: { equals: endereco, mode: 'insensitive' },
    },
    orderBy: { id: 'asc' },
  })
  if (existente) {
    if (telefone && !existente.telefone) {
      return tx.cliente.update({ where: { id: existente.id }, data: { telefone } })
    }
    return existente
  }

  return tx.cliente.create({ data: { nomeCliente: nome, endereco, telefone } })
}
