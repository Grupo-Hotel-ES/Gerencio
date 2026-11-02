import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { htmlDoMapa, type CoresMapa } from './html';

import { Raio } from '@/constants/tokens';
import type { RotaCalculada } from '@/data/rotas';

/** App: o mapa Leaflet roda numa WebView. */
export function MapaOsm({ rota, cores, altura }: { rota: RotaCalculada; cores: CoresMapa; altura: number }) {
  return (
    <View style={[styles.moldura, { height: altura }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: htmlDoMapa(rota, cores) }}
        accessibilityLabel="Mapa da rota (OpenStreetMap)"
        // Dentro de um ScrollView, o gesto de arrastar deve mover o mapa
        nestedScrollEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  moldura: { borderRadius: Raio.small, overflow: 'hidden' },
});
