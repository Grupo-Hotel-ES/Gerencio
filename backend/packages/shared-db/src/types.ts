// Tipos compartilhados entre os microsserviços.

/** Formato padrão de erro devolvido pelas APIs. */
export interface ApiError {
  error: string
}

/** Converte um parâmetro de rota em inteiro, ou devolve null se for inválido. */
export function parseId(value: string | undefined): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}
