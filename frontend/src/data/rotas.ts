export type MeioTransporte = 'moto' | 'bicicleta' | 'carro';

export const MEIOS_TRANSPORTE: { id: MeioTransporte; rotulo: string }[] = [
  { id: 'moto', rotulo: 'Moto' },
  { id: 'bicicleta', rotulo: 'Bicicleta' },
  { id: 'carro', rotulo: 'Carro' },
];

export type Parada = {
  id: number;
  cliente: string;
  endereco: string;
  /** Bairro e complemento, ex.: "Centro • Portaria A". */
  complemento: string;
};

export type PontoPartida = {
  nome: string;
  endereco: string;
};

export const PARTIDA_EXEMPLO: PontoPartida = {
  nome: 'Vila Bistrô',
  endereco: 'Rua da Vila, 18 • Centro',
};

export const PARADAS_EXEMPLO: Parada[] = [
  { id: 1, cliente: 'João Almeida', endereco: 'Rua do Comércio, 45', complemento: 'Centro • Portaria A' },
  { id: 2, cliente: 'Beatriz Rocha', endereco: 'Av. Central, 120', complemento: 'Centro • Apto. 302' },
  { id: 3, cliente: 'Rafael Lima', endereco: 'Rua das Palmeiras, 90', complemento: 'Centro • Casa 2' },
];

/** Estimativa demonstrativa (sem trânsito nem rota real) até existir um endpoint de rotas. */
export function estimarRota(quantidadeParadas: number) {
  return {
    distanciaKm: Math.round(quantidadeParadas * 1.27 * 10) / 10,
    duracaoMin: quantidadeParadas * 8,
  };
}

export function formatarDistancia(km: number) {
  return km.toFixed(1).replace('.', ',') + ' km';
}
