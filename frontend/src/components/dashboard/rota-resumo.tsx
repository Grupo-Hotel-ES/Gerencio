import { StyleSheet, View } from 'react-native';

import { SeloNumero } from '@/components/dashboard/rota-paradas';
import { Cartao, Divisor, Icone, Texto } from '@/components/dashboard/ui';
import { Espacamento } from '@/constants/tokens';
import { estimarRota, formatarDistancia, type Parada, type PontoPartida } from '@/data/rotas';

/** Paradas, distância, duração e a sequência Saída → 1 → 2 → 3. */
export function RotaResumo({ partida, paradas }: { partida: PontoPartida; paradas: Parada[] }) {
  const { distanciaKm, duracaoMin } = estimarRota(paradas.length);

  return (
    <Cartao style={styles.cartao}>
      <View style={styles.numeros}>
        <Dado rotulo="Paradas" valor={String(paradas.length)} />
        <Dado rotulo="Distância" valor={formatarDistancia(distanciaKm)} />
        <Dado rotulo="Duração" valor={duracaoMin + ' min'} />
      </View>
      <Divisor />
      <View style={styles.sequencia}>
        <Icone nome="loja" />
        <Texto tamanho={13}>{partida.nome}</Texto>
        {paradas.map((parada, i) => (
          <View key={parada.id} style={styles.passo}>
            <Icone nome="setaDireita" tamanho={14} />
            <SeloNumero numero={i + 1} tamanho={28} />
          </View>
        ))}
      </View>
      <Texto tamanho={13} cor="textoSecundario">
        Trajeto e estimativas demonstrativos. Sem trânsito ou navegação em tempo real.
      </Texto>
    </Cartao>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.dado}>
      <Texto tamanho={13} cor="textoSecundario">{rotulo}</Texto>
      <Texto tamanho={20} peso={600}>{valor}</Texto>
    </View>
  );
}

const styles = StyleSheet.create({
  cartao: { gap: Espacamento.medium },
  numeros: { flexDirection: 'row', gap: Espacamento.large },
  dado: { flex: 1, gap: Espacamento.xsmall },
  sequencia: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Espacamento.small },
  passo: { flexDirection: 'row', alignItems: 'center', gap: Espacamento.small },
});
