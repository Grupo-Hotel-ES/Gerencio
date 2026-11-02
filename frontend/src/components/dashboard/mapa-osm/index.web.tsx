import { StyleSheet, View } from 'react-native';

import { htmlDoMapa, type CoresMapa } from './html';

import { Raio } from '@/constants/tokens';
import type { RotaCalculada } from '@/data/rotas';

/** Web: o mapa Leaflet roda num iframe isolado da página. */
export function MapaOsm({ rota, cores, altura }: { rota: RotaCalculada; cores: CoresMapa; altura: number }) {
  return (
    <View style={[styles.moldura, { height: altura }]}>
      <iframe
        title="Mapa da rota (OpenStreetMap)"
        // Sem sandbox: com origem opaca o navegador não envia Referer, e os tiles do OSM o exigem
        srcDoc={htmlDoMapa(rota, cores)}
        style={{ border: 0, width: '100%', height: '100%' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  moldura: { borderRadius: Raio.small, overflow: 'hidden' },
});
