import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Cartao, Divisor, Icone, Texto } from '@/components/dashboard/ui';
import { Espacamento, Raio } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';

export function AuthLayout({ children }: { children: ReactNode }) {
  const cores = useCores();
  const { width } = useWindowDimensions();
  const comBanner = width >= 860;

  return (
    <View style={[styles.raiz, { backgroundColor: cores.superficie }]}>
      {comBanner && (
        <View style={[styles.banner, { backgroundColor: cores.fundo2 }]}>
          <View style={styles.bannerLogo}>
            <View style={[styles.logoIcone, { backgroundColor: cores.brand }]}>
              <Icone nome="logo" cor={cores.textOnBrand} />
            </View>
            <Texto tamanho={24} peso={700}>
              Gerêncio
            </Texto>
          </View>

          <View style={styles.bannerHero}>
            <Texto tamanho={36} peso={700} style={styles.bannerTitulo}>
              {'Sua operação,\nem um só lugar.'}
            </Texto>
            <Texto tamanho={16} cor="textoSecundario" style={styles.bannerSubtitulo}>
              Da cozinha ao delivery, cuide do estoque e acompanhe seus pedidos com mais tranquilidade.
            </Texto>

            <Cartao style={styles.cardCanais}>
              <Texto tamanho={16} peso={600}>
                Seis canais, uma operação.
              </Texto>
              <Texto tamanho={14} peso={500}>
                {'WhatsApp • iFood • 99 Food\nUber Eats • Rappi • Keeta'}
              </Texto>
              <Divisor />
              <Texto tamanho={13} cor="textoSecundario">
                Estoque central com baixa automática por pedido e sincronização de disponibilidade.
              </Texto>
            </Cartao>
          </View>

          <Texto tamanho={13} cor="textoSecundario">
            Gerêncio • Gestão de delivery para pequenos restaurantes
          </Texto>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.formularioScroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.formularioContainer}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
    flexDirection: 'row',
  },
  banner: {
    width: 380,
    padding: Espacamento.xlarge,
    justifyContent: 'space-between',
  },
  bannerLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
  },
  logoIcone: {
    width: 32,
    height: 32,
    borderRadius: Raio.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerHero: {
    gap: Espacamento.large,
  },
  bannerTitulo: {
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  bannerSubtitulo: {
    lineHeight: 22,
  },
  cardCanais: {
    gap: Espacamento.medium,
    marginTop: Espacamento.medium,
  },
  formularioScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Espacamento.xlarge,
  },
  formularioContainer: {
    width: '100%',
    maxWidth: 440,
    gap: Espacamento.large,
  },
});

