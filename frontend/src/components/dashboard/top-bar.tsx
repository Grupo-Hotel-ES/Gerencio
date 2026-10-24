import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icone, Texto } from './ui';

import { Espacamento, Raio } from '@/constants/tokens';
import { formatarHora } from '@/data/pedidos';
import { useCores } from '@/hooks/use-cores';

function formatarAgora(agora: Date) {
  const data = agora.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
  return `Hoje, ${data.replace(/ de /g, ' ')} • ${formatarHora(agora)}`;
}

export function TopBar() {
  const cores = useCores();
  // Preenchido só no cliente para não divergir do HTML gerado na renderização estática.
  const [agora, setAgora] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- O relógio só começa após a hidratação do HTML estático.
    setAgora(new Date());
    const intervalo = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(intervalo);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: cores.superficie }]}>
      <Texto tamanho={16} peso={500}>
        Gerôncio
      </Texto>

      <View style={styles.direita}>
        <Texto tamanho={13} cor="textoSecundario">
          {agora ? formatarAgora(agora) : ''}
        </Texto>
        <Pressable accessibilityRole="button" accessibilityLabel="Notificações">
          <Icone nome="sino" />
        </Pressable>
        <View style={[styles.avatar, { backgroundColor: cores.brand }]}>
          <Texto peso={600} cor="textOnBrand">
            G
          </Texto>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.medium,
    height: 68,
    paddingHorizontal: Espacamento.large,
  },
  direita: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.large,
    marginLeft: 'auto',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: Raio.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
