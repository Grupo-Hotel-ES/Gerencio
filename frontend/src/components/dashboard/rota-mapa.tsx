import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { MapaOsm } from '@/components/dashboard/mapa-osm';
import { RotaMapaIlustrativo } from '@/components/dashboard/rota-mapa-ilustrativo';
import { Cartao, Chip, Texto } from '@/components/dashboard/ui';
import { Espacamento, Raio } from '@/constants/tokens';
import { type Parada, type RotaCalculada } from '@/data/rotas';
import { useCores } from '@/hooks/use-cores';

/** Mapa do OpenStreetMap com o traçado da rota calculada pela api-pedidos. */
export function RotaMapa({ rota, paradas, calculando, altura = 360 }: {
  rota: RotaCalculada | null; paradas: Parada[]; calculando: boolean; altura?: number;
}) {
  const cores = useCores();

  return (
    <Cartao style={styles.cartao}>
      <View style={styles.linha}>
        <Texto tamanho={18} peso={500}>Visualização da rota</Texto>
        <Chip rotulo={rota ? (rota.metodoCalculo === 'rota_viaria' ? 'Rota pelas vias' : 'Estimativa em linha reta') : calculando ? 'Calculando…' : 'Ilustrativo'} />
      </View>

      {rota ? (
        <MapaOsm
          rota={rota}
          altura={altura}
          cores={{
            rota: cores.statusNovo,
            selo: cores.brand,
            textoSelo: cores.textOnBrand,
            partida: cores.textoPrincipal,
            textoPartida: cores.superficie,
          }}
        />
      ) : !calculando ? (
        <>
          <RotaMapaIlustrativo paradas={paradas} altura={altura} />
          <Texto tamanho={13} cor="textoSecundario">
            Prévia ilustrativa da sequência de paradas. Toque em &quot;Visualizar rota no mapa&quot; para conferir o percurso.
          </Texto>
        </>
      ) : (
        <View style={[styles.vazio, { height: altura, backgroundColor: cores.fundo, borderColor: cores.borda }]}>
          <ActivityIndicator color={cores.textoPrincipal} />
          <Texto cor="textoSecundario" style={styles.centro}>
            Localizando os endereços e calculando a rota…
          </Texto>
        </View>
      )}
    </Cartao>
  );
}

const styles = StyleSheet.create({
  cartao: { gap: Espacamento.medium },
  linha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Espacamento.small },
  vazio: { alignItems: 'center', justifyContent: 'center', gap: Espacamento.medium, padding: Espacamento.large, borderWidth: 1, borderRadius: Raio.small },
  centro: { textAlign: 'center' },
});
