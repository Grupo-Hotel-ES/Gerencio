import { StyleSheet, View } from 'react-native';

import { SeloNumero } from '@/components/dashboard/rota-paradas';
import { Icone, Texto } from '@/components/dashboard/ui';
import { Espacamento, Raio } from '@/constants/tokens';
import { type Parada } from '@/data/rotas';
import { useCores } from '@/hooks/use-cores';

type Ponto = { x: number; y: number };

// Posições (em %) do ponto de partida e das paradas no mapa ilustrativo.
const PARTIDA: Ponto = { x: 18, y: 70 };
const ANCORAS: Ponto[] = [
  { x: 42, y: 70 },
  { x: 68, y: 45 },
  { x: 68, y: 24 },
  { x: 30, y: 24 },
  { x: 30, y: 45 },
  { x: 55, y: 12 },
  { x: 85, y: 70 },
  { x: 85, y: 24 },
  { x: 88, y: 45 },
  { x: 12, y: 88 },
];
const RUAS_VERTICAIS = [12, 30, 42, 55, 68, 88];
const RUAS_HORIZONTAIS = [12, 24, 45, 70, 88];
const ESPESSURA_RUA = 8;
const ESPESSURA_ROTA = 4;

type Segmento =
  | { tipo: 'v'; x: number; inicio: number; fim: number }
  | { tipo: 'h'; y: number; inicio: number; fim: number };

/** Liga os pontos em "L": primeiro na vertical, depois na horizontal. */
function segmentosDaRota(pontos: Ponto[]): Segmento[] {
  const segmentos: Segmento[] = [];
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i];
    const b = pontos[i + 1];
    if (a.y !== b.y) segmentos.push({ tipo: 'v', x: a.x, inicio: Math.min(a.y, b.y), fim: Math.max(a.y, b.y) });
    if (a.x !== b.x) segmentos.push({ tipo: 'h', y: b.y, inicio: Math.min(a.x, b.x), fim: Math.max(a.x, b.x) });
  }
  return segmentos;
}

/**
 * Mapa ilustrativo desenhado com Views, adaptado do PR #44 de João Soldera (solderaj).
 * Mantém o visual original e recebe as paradas da tela atual.
 */
export function RotaMapaIlustrativo({ paradas, altura = 360 }: { paradas: Parada[]; altura?: number }) {
  const cores = useCores();
  const pontos = paradas.map((_, i) => ANCORAS[Math.min(i, ANCORAS.length - 1)]);
  const segmentos = segmentosDaRota([PARTIDA, ...pontos]);

  return (
    <View
      accessible
      accessibilityLabel={'Mapa ilustrativo com ' + paradas.length + ' paradas'}
      style={[styles.mapa, { height: altura, backgroundColor: cores.borda }]}>
      {RUAS_VERTICAIS.map((x) => (
        <View key={'v' + x} style={[styles.rua, { left: `${x}%`, top: 0, bottom: 0, width: ESPESSURA_RUA, marginLeft: -ESPESSURA_RUA / 2, backgroundColor: cores.superficie }]} />
      ))}
      {RUAS_HORIZONTAIS.map((y) => (
        <View key={'h' + y} style={[styles.rua, { top: `${y}%`, left: 0, right: 0, height: ESPESSURA_RUA, marginTop: -ESPESSURA_RUA / 2, backgroundColor: cores.superficie }]} />
      ))}
      <View style={[styles.parque, { left: '3%', top: '34%', width: '7%', height: '22%', backgroundColor: cores.feedbackSucesso }]} />
      <View style={[styles.parque, { left: '74%', top: '58%', width: '10%', height: '28%', backgroundColor: cores.feedbackSucesso }]} />

      <Texto tamanho={11} cor="textoSecundario" style={[styles.rotulo, { left: '14%', top: '16%' }]}>Rua das Palmeiras</Texto>
      <Texto tamanho={11} cor="textoSecundario" style={[styles.rotulo, { left: '46%', top: '38%' }]}>Av. Central</Texto>
      <Texto tamanho={11} cor="textoSecundario" style={[styles.rotulo, { left: '44%', top: '74%' }]}>Rua do Comércio</Texto>
      <Texto tamanho={11} cor="textoSecundario" style={[styles.rotulo, { left: '2%', top: '74%' }]}>Rua da Vila</Texto>

      <View style={[styles.legenda, { backgroundColor: cores.superficie, borderColor: cores.borda }]}>
        <Texto tamanho={12}>Centro • mapa ilustrativo</Texto>
      </View>

      {segmentos.map((s, i) =>
        s.tipo === 'v' ? (
          <View key={i} style={[styles.rota, { left: `${s.x}%`, top: `${s.inicio}%`, height: `${s.fim - s.inicio}%`, width: ESPESSURA_ROTA, marginLeft: -ESPESSURA_ROTA / 2, backgroundColor: cores.statusNovo }]} />
        ) : (
          <View key={i} style={[styles.rota, { top: `${s.y}%`, left: `${s.inicio}%`, width: `${s.fim - s.inicio}%`, height: ESPESSURA_ROTA, marginTop: -ESPESSURA_ROTA / 2, backgroundColor: cores.statusNovo }]} />
        ),
      )}

      <View style={[styles.marcador, { left: `${PARTIDA.x}%`, top: `${PARTIDA.y}%`, backgroundColor: cores.textoPrincipal }]}>
        <Icone nome="loja" tamanho={16} cor={cores.superficie} />
      </View>
      {pontos.map((p, i) => (
        <View key={paradas[i].id} style={[styles.marcador, { left: `${p.x}%`, top: `${p.y}%` }]}>
          <SeloNumero numero={i + 1} tamanho={28} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  mapa: { borderRadius: Raio.small, overflow: 'hidden' },
  rua: { position: 'absolute' },
  rota: { position: 'absolute', borderRadius: 2 },
  parque: { position: 'absolute', borderRadius: Raio.medium, opacity: 0.25 },
  rotulo: { position: 'absolute' },
  legenda: { position: 'absolute', left: Espacamento.medium, top: Espacamento.medium, paddingHorizontal: Espacamento.medium, paddingVertical: Espacamento.small, borderWidth: 1, borderRadius: Raio.small },
  marcador: { position: 'absolute', width: 28, height: 28, marginLeft: -14, marginTop: -14, borderRadius: Raio.small, alignItems: 'center', justifyContent: 'center' },
});
