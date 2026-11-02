export type MeioTransporte = 'moto' | 'bicicleta' | 'carro';

export const MEIOS_TRANSPORTE: { id: MeioTransporte; rotulo: string }[] = [
  { id: 'moto', rotulo: 'Moto' },
  { id: 'bicicleta', rotulo: 'Bicicleta' },
  { id: 'carro', rotulo: 'Carro' },
];

/** O link do Google Maps aceita origem, destino e até 9 pontos intermediários. */
export const MAXIMO_PARADAS = 10;

/** Pedido pronto para entrega, usado como parada da rota. */
export type Parada = {
  /** Número do pedido. */
  id: number;
  cliente: string;
  endereco: string;
  /** CEP e canal, ex.: "CEP 12282-011 • WhatsApp". */
  complemento: string;
};

export type PontoPartida = {
  nome: string;
  endereco: string;
};

export type Coordenada = { latitude: number; longitude: number };

/** Rota calculada pela api-pedidos (OSRM), na ordem das paradas. */
export type RotaCalculada = {
  origem: PontoPartida & Coordenada;
  paradas: (Coordenada & { pedidoId: number; cliente: string | null; endereco: string })[];
  distanciaKm: number;
  duracaoMinutos: number;
  /** Traçado pelas vias como [latitude, longitude]. */
  geometria: [number, number][];
  metodoCalculo: 'rota_viaria' | 'contingencia_haversine';
};

export function formatarDistancia(km: number) {
  return km.toFixed(1).replace('.', ',') + ' km';
}
