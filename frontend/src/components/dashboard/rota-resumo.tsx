import * as Clipboard from 'expo-clipboard';
import { openBrowserAsync } from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { QrCode } from '@/components/dashboard/qr-code';
import { SeloNumero } from '@/components/dashboard/rota-paradas';
import { Aviso, Botao, Cartao, Divisor, Icone, Texto } from '@/components/dashboard/ui';
import { Espacamento, Raio } from '@/constants/tokens';
import { formatarDistancia, type Parada, type PontoPartida, type RotaCalculada } from '@/data/rotas';
import { useCores } from '@/hooks/use-cores';

type Props = {
  partida: PontoPartida | null;
  paradas: Parada[];
  /** Rota calculada para a sequência atual (null se ainda não visualizada ou se mudou). */
  rota: RotaCalculada | null;
  onExportar: () => void;
  exportando: boolean;
  /** Resultado da última exportação. */
  exportada: { url: string; pedidoIds: number[] } | null;
  onFecharExportacao: () => void;
};

/** Paradas, distância, duração, a sequência Saída → 1 → 2 → 3 e a exportação para o Google Maps. */
export function RotaResumo({ partida, paradas, rota, onExportar, exportando, exportada, onFecharExportacao }: Props) {
  const cores = useCores();
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    if (!exportada) return;
    await Clipboard.setStringAsync(exportada.url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  if (exportada) {
    return (
      <Cartao style={styles.cartao}>
        <Texto tamanho={18} peso={500}>Rota exportada</Texto>
        <Aviso
          icone="motoboy"
          titulo={exportada.pedidoIds.length === 1 ? 'Pedido saiu para entrega' : `${exportada.pedidoIds.length} pedidos saíram para entrega`}
          texto={exportada.pedidoIds.map((id) => '#' + id).join(', ')}
        />
        <Texto peso={500} style={styles.centro}>Escaneie para abrir a rota no Google Maps</Texto>
        <QrCode valor={exportada.url} />
        <Texto tamanho={12} cor="textoSecundario" selectable numberOfLines={2} style={[styles.link, { borderColor: cores.borda }]}>
          {exportada.url}
        </Texto>
        <View style={styles.acoes}>
          <Botao rotulo={copiado ? 'Link copiado' : 'Copiar link'} icone="copiar" variante="primario" onPress={copiar} />
          <Botao rotulo="Abrir no Google Maps" icone="mapa" onPress={() => openBrowserAsync(exportada.url)} />
          <Botao rotulo="Planejar outra rota" onPress={onFecharExportacao} />
        </View>
      </Cartao>
    );
  }

  return (
    <Cartao style={styles.cartao}>
      <View style={styles.numeros}>
        <Dado rotulo="Paradas" valor={String(paradas.length)} />
        <Dado rotulo="Distância" valor={rota ? formatarDistancia(rota.distanciaKm) : '—'} />
        <Dado rotulo="Duração" valor={rota ? rota.duracaoMinutos + ' min' : '—'} />
      </View>
      <Divisor />
      <View style={styles.sequencia}>
        <Icone nome="loja" />
        <Texto tamanho={13}>{partida?.nome ?? 'Restaurante'}</Texto>
        {paradas.map((parada, i) => (
          <View key={parada.id} style={styles.passo}>
            <Icone nome="setaDireita" tamanho={14} />
            <SeloNumero numero={i + 1} tamanho={28} />
          </View>
        ))}
      </View>
      <Texto tamanho={13} cor="textoSecundario">
        {rota
          ? 'Distância e duração pelas vias (OpenStreetMap), sem trânsito em tempo real.'
          : 'Visualize a rota no mapa para ver a distância e a duração.'}
      </Texto>
      <Divisor />
      <Botao
        rotulo={exportando ? 'Exportando…' : 'Exportar rota'}
        icone="setaDireita"
        variante="primario"
        disabled={exportando || paradas.length === 0}
        onPress={onExportar}
      />
      <Texto tamanho={13} cor="textoSecundario">
        Gera um link do Google Maps com a rota completa e marca os pedidos como &quot;saiu para entrega&quot;.
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
  centro: { textAlign: 'center' },
  link: { padding: Espacamento.small, borderWidth: 1, borderRadius: Raio.small },
  acoes: { gap: Espacamento.small },
});
