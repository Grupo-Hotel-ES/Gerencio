import { db } from './client'

/**
 * O app é whitelabel: atende um restaurante só. A migration garante que ele exista;
 * aqui ele é criado de novo apenas se alguém o tiver apagado.
 */
export async function obterRestaurantePrincipal() {
  const restaurante = await db.restaurante.findFirst({ orderBy: { id: 'asc' } })
  if (restaurante) return restaurante
  return db.restaurante.create({
    data: { cnpj: '00.000.000/0000-00', nome: 'Meu restaurante', email: '', telefone: '', cep: '', cidade: '', endereco: '' },
  })
}

/** Id informado na requisição ou, sem ele, o do restaurante principal. */
export async function resolverRestauranteId(informado?: number | null) {
  return informado ?? (await obterRestaurantePrincipal()).id
}
