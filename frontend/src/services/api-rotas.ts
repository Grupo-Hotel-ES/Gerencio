import type { MeioTransporte, Parada, RotaCalculada } from '@/data/rotas';
import { nomeDoCanal, requisitar } from './api-pedidos';

/** Pedido no formato devolvido pela api-pedidos (só o que a rota usa). */
type PedidoApi = {
  id: number;
  nomeCliente: string | null;
  app: string;
  enderecoDestino: string;
  cepDestino: string;
};

function formatarCep(cep: string) {
  const digitos = cep.replace(/\D/g, '');
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : cep;
}

/** Pedidos prontos com entrega (retiradas no local ficam de fora), do mais antigo para o mais novo. */
export async function listarPedidosParaRota(): Promise<Parada[]> {
  const pedidos = await requisitar<PedidoApi[]>('/pedidos?status=pronto');
  return pedidos
    .filter((p) => p.cepDestino.trim())
    .sort((a, b) => a.id - b.id)
    .map((p) => ({
      id: p.id,
      cliente: p.nomeCliente ?? 'Cliente não identificado',
      endereco: p.enderecoDestino,
      complemento: `CEP ${formatarCep(p.cepDestino)} • ${nomeDoCanal(p.app)}`,
    }));
}

/** Sai do restaurante do app (único), resolvido pela api-pedidos. */
type EntradaRota = { pedidoIds: number[]; transporte: MeioTransporte };

// Localizar endereços no mapa (Nominatim) pode levar alguns segundos por pedido
const TEMPO_LIMITE_ROTA_MS = 60_000;

function postar<T>(caminho: string, dados: EntradaRota) {
  return requisitar<T>(caminho, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  }, TEMPO_LIMITE_ROTA_MS);
}

/** Traçado pelas vias, distância e duração. Geocodifica os pedidos que ainda não têm coordenadas. */
export function calcularRota(dados: EntradaRota) {
  return postar<RotaCalculada>('/rotas/calcular', dados);
}

/** Gera o link do Google Maps e marca os pedidos como "saiu para entrega". */
export function exportarRota(dados: EntradaRota) {
  return postar<{ url: string; pedidoIds: number[] }>('/rotas/exportar', dados);
}
