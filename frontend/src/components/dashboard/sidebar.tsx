import { Link, usePathname, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Divisor, Icone, Texto, type NomeIcone } from './ui';

import { Espacamento, Raio } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';

// A página de Rotas ainda não foi implementada, por isso não tem `href`.
const NAVEGACAO: { rotulo: string; icone: NomeIcone; href?: Href }[] = [
  { rotulo: 'Pedidos', icone: 'pedidos', href: '/' },
  { rotulo: 'Estoque', icone: 'estoque', href: '/estoque' },
  { rotulo: 'Relatórios', icone: 'relatorios', href: '/relatorios' },
  { rotulo: 'Rotas', icone: 'rotas' },
];

function ItensNavegacao() {
  const cores = useCores();
  const pathname = usePathname();

  return NAVEGACAO.map(({ rotulo, icone, href }) => {
    const ativo = href === pathname;
    // O estilo fica na View interna: o `Link asChild` substitui o `style` do filho direto.
    const item = (
      <Pressable
        key={rotulo}
        accessibilityRole="link"
        accessibilityState={{ selected: ativo, disabled: !href }}
        disabled={!href}>
        <View style={[styles.item, ativo && { backgroundColor: cores.brand }]}>
          <Icone nome={icone} cor={ativo ? cores.textOnBrand : cores.textoPrincipal} />
          <Texto peso={ativo ? 600 : 500} cor={ativo ? 'textOnBrand' : 'textoPrincipal'}>
            {rotulo}
          </Texto>
        </View>
      </Pressable>
    );
    return href ? (
      <Link key={rotulo} href={href} asChild>
        {item}
      </Link>
    ) : (
      item
    );
  });
}

/** Navegação em linha, usada quando não há espaço para a sidebar. */
export function NavegacaoCompacta() {
  const cores = useCores();
  return (
    <View style={[styles.compacta, { backgroundColor: cores.superficie, borderColor: cores.borda }]}>
      <ItensNavegacao />
    </View>
  );
}

export function Sidebar() {
  const cores = useCores();

  return (
    <View style={[styles.container, { backgroundColor: cores.superficie, borderColor: cores.borda }]}>
      <View style={styles.logo}>
        <View style={[styles.logoIcone, { backgroundColor: cores.brand }]}>
          <Icone nome="logo" cor={cores.textOnBrand} />
        </View>
        <Texto tamanho={24} peso={700}>
          mesa
        </Texto>
      </View>

      <Divisor />

      <View style={styles.navegacao}>
        <Texto tamanho={13} cor="textoSecundario" style={styles.secao}>
          OPERAÇÃO DO RESTAURANTE
        </Texto>
        <ItensNavegacao />
      </View>

      <View style={styles.rodape}>
        <View style={[styles.destaque, { backgroundColor: cores.fundo, borderColor: cores.borda }]}>
          <Icone nome="camadas" />
          <View style={styles.destaqueTexto}>
            <Texto tamanho={16} peso={500}>
              Tudo em um lugar
            </Texto>
            <Texto tamanho={13} cor="textoSecundario">
              Seis canais, uma operação.
            </Texto>
          </View>
        </View>

        <Pressable accessibilityRole="link" style={styles.ajuda}>
          <Icone nome="ajuda" />
          <Texto peso={500}>Central de ajuda</Texto>
        </Pressable>

        <Divisor />

        <View style={styles.usuario}>
          <Texto tamanho={16} peso={500}>
            Vila Bistrô
          </Texto>
          <Texto tamanho={13} cor="textoSecundario">
            Marina • Administradora
          </Texto>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 224,
    borderRightWidth: 1,
    padding: Espacamento.large,
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
    paddingTop: Espacamento.large,
    paddingBottom: Espacamento.xlarge,
  },
  logoIcone: {
    width: 32,
    height: 32,
    borderRadius: Raio.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navegacao: {
    flex: 1,
    gap: Espacamento.small,
    paddingTop: Espacamento.large,
  },
  secao: {
    marginBottom: Espacamento.small,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
    height: 36,
    paddingHorizontal: Espacamento.small,
    borderRadius: Raio.small,
  },
  compacta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Espacamento.small,
    paddingHorizontal: Espacamento.large,
    paddingBottom: Espacamento.medium,
    borderBottomWidth: 1,
  },
  rodape: {
    gap: Espacamento.large,
  },
  destaque: {
    flexDirection: 'row',
    gap: Espacamento.medium,
    padding: Espacamento.large,
    borderWidth: 1,
    borderRadius: Raio.medium,
  },
  destaqueTexto: {
    flex: 1,
    gap: Espacamento.xsmall,
  },
  ajuda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
  },
  usuario: {
    gap: Espacamento.large,
    paddingTop: Espacamento.xsmall,
  },
});
