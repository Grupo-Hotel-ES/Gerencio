import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { MapaOsm } from '@/components/dashboard/mapa-osm';
import { Cartao, Chip, Icone, Texto } from '@/components/dashboard/ui';
import { Espacamento, Raio } from '@/constants/tokens';
import { type RotaCalculada } from '@/data/rotas';
import { useCores } from '@/hooks/use-cores';

/** Mapa do OpenStreetMap com o traçado da rota calculada pela api-pedidos. */
export function RotaMapa({ rota, calculando, altura = 360 }: {
  rota: RotaCalculada | null; calculando: boolean; altura?: number;
}) {
  const cores = useCores();

  return (
    <Cartao style={styles.cartao}>
      <View style={styles.linha}>
        <Texto tamanho={18} peso={500}>Visualização da rota</Texto>
        {rota && <Chip rotulo={rota.metodoCalculo === 'rota_viaria' ? 'Rota pelas vias' : 'Estimativa em linha reta'} />}
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
      ) : (
        <View style={[styles.vazio, { height: altura, backgroundColor: cores.fundo, borderColor: cores.borda }]}>
          {calculando ? <ActivityIndicator color={cores.textoPrincipal} /> : <Icone nome="mapa" tamanho={32} />}
          <Texto cor="textoSecundario" style={styles.centro}>
            {calculando ? 'Localizando os endereços e calculando a rota…' : 'Escolha os pedidos e toque em "Visualizar rota no mapa".'}
          </Texto>
        </View>
      )}
    </Cartao>
  );
}

const styles = StyleSheet.create({
  cartao: { gap: Espacamento.medium },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Espacamento.small },
  vazio: { alignItems: 'center', justifyContent: 'center', gap: Espacamento.medium, padding: Espacamento.large, borderWidth: 1, borderRadius: Raio.small },
  centro: { textAlign: 'center' },
});
