import { Slot } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LarguraConteudoProvider } from '@/components/dashboard/pagina';
import { NavegacaoCompacta, Sidebar } from '@/components/dashboard/sidebar';
import { TopBar } from '@/components/dashboard/top-bar';
import { useCores } from '@/hooks/use-cores';

const LARGURA_SIDEBAR = 224;

/** Moldura das páginas de operação: sidebar, barra superior e a página ativa. */
export default function PainelLayout() {
  const cores = useCores();
  // Largura do protótipo web como valor inicial; ajustada no primeiro layout.
  const [largura, setLargura] = useState(1440);
  const comSidebar = largura >= 960;

  return (
    <View
      style={[styles.raiz, { backgroundColor: cores.fundo }]}
      onLayout={(e) => setLargura(e.nativeEvent.layout.width)}>
      {comSidebar && <Sidebar />}

      <View style={styles.principal}>
        <TopBar />
        {!comSidebar && <NavegacaoCompacta />}
        <LarguraConteudoProvider value={largura - (comSidebar ? LARGURA_SIDEBAR : 0)}>
          <Slot />
        </LarguraConteudoProvider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
    flexDirection: 'row',
  },
  principal: {
    flex: 1,
  },
});
