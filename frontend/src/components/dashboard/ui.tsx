import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { Fonts } from '@/constants/theme';
import { Espacamento, Raio, type CoresTema } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';

const ICONES = {
  logo: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  pedidos: { ios: 'list.bullet.rectangle', android: 'receipt_long', web: 'receipt_long' },
  estoque: { ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' },
  relatorios: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' },
  rotas: { ios: 'arrow.triangle.swap', android: 'route', web: 'route' },
  camadas: { ios: 'square.stack.3d.up', android: 'layers', web: 'layers' },
  ajuda: { ios: 'questionmark.circle', android: 'help', web: 'help' },
  sino: { ios: 'bell', android: 'notifications', web: 'notifications' },
  mais: { ios: 'plus', android: 'add', web: 'add' },
  seta: { ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' },
  busca: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  menos: { ios: 'minus', android: 'remove', web: 'remove' },
  salvar: { ios: 'square.and.arrow.down', android: 'save', web: 'save' },
  sincronizar: { ios: 'arrow.triangle.2.circlepath', android: 'sync', web: 'sync' },
  escudo: { ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
  baixar: { ios: 'arrow.down.to.line', android: 'download', web: 'download' },
  calendario: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
} as const satisfies Record<string, SymbolViewProps['name']>;

export type NomeIcone = keyof typeof ICONES;

export function Icone({ nome, cor, tamanho = 20 }: { nome: NomeIcone; cor?: string; tamanho?: number }) {
  const cores = useCores();
  return <SymbolView name={ICONES[nome]} size={tamanho} tintColor={cor ?? cores.textoPrincipal} />;
}

type TextoProps = TextProps & {
  tamanho?: number;
  peso?: 400 | 500 | 600 | 700;
  cor?: keyof CoresTema;
};

export function Texto({ tamanho = 14, peso = 400, cor = 'textoPrincipal', style, ...rest }: TextoProps) {
  const cores = useCores();
  return (
    <Text
      style={[
        { fontFamily: Fonts?.sans, fontSize: tamanho, fontWeight: peso, color: cores[cor] },
        style,
      ]}
      {...rest}
    />
  );
}

/** Etiqueta com um ponto colorido, usada para status, canal e situação da loja. */
export function Etiqueta({ rotulo, corPonto }: { rotulo: string; corPonto: string }) {
  const cores = useCores();
  return (
    <View style={[styles.etiqueta, { borderColor: cores.borda, backgroundColor: cores.superficie }]}>
      <View style={[styles.ponto, { backgroundColor: corPonto }]} />
      <Texto peso={500}>{rotulo}</Texto>
    </View>
  );
}

export function Cartao({ style, ...rest }: ViewProps) {
  const cores = useCores();
  return (
    <View
      style={[styles.cartao, { borderColor: cores.borda, backgroundColor: cores.superficie }, style]}
      {...rest}
    />
  );
}

/** Filtro em forma de pílula; sem `onPress` fica apenas informativo. */
export function Chip({
  rotulo,
  ativo = false,
  onPress,
}: {
  rotulo: string;
  ativo?: boolean;
  onPress?: () => void;
}) {
  const cores = useCores();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: ativo, disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: ativo ? cores.brand : cores.borda,
          backgroundColor: ativo ? cores.brand : cores.superficie,
        },
      ]}>
      <Texto peso={500} cor={ativo ? 'textOnBrand' : 'textoPrincipal'}>
        {rotulo}
      </Texto>
    </Pressable>
  );
}

type BotaoProps = Omit<PressableProps, 'style'> & {
  rotulo: string;
  icone?: NomeIcone;
  variante?: 'primario' | 'contorno';
  style?: StyleProp<ViewStyle>;
};

export function Botao({ rotulo, icone, variante = 'contorno', style, ...rest }: BotaoProps) {
  const cores = useCores();
  const primario = variante === 'primario';
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.botao,
        primario
          ? { backgroundColor: cores.brand, borderColor: cores.brand }
          : { backgroundColor: cores.superficie, borderColor: cores.borda },
        pressed && styles.pressionado,
        style,
      ]}
      {...rest}>
      {icone && <Icone nome={icone} cor={primario ? cores.textOnBrand : cores.textoPrincipal} />}
      <Texto peso={500} cor={primario ? 'textOnBrand' : 'textoPrincipal'}>
        {rotulo}
      </Texto>
    </Pressable>
  );
}

/** Faixa de aviso com ícone, título e texto de apoio. */
export function Aviso({ icone, titulo, texto }: { icone: NomeIcone; titulo: string; texto: string }) {
  const cores = useCores();
  return (
    <Cartao style={[styles.aviso, { backgroundColor: cores.fundo }]}>
      <Icone nome={icone} />
      <View style={styles.avisoTexto}>
        <Texto tamanho={16} peso={500}>
          {titulo}
        </Texto>
        <Texto tamanho={13} cor="textoSecundario">
          {texto}
        </Texto>
      </View>
    </Cartao>
  );
}

export function Divisor() {
  const cores = useCores();
  return <View style={{ height: 1, backgroundColor: cores.borda }} />;
}

const styles = StyleSheet.create({
  etiqueta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
    paddingHorizontal: Espacamento.small,
    height: 28,
    borderWidth: 1,
    borderRadius: Raio.small,
  },
  ponto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cartao: {
    borderWidth: 1,
    borderRadius: Raio.medium,
    padding: Espacamento.large,
  },
  chip: {
    height: 36,
    paddingHorizontal: Espacamento.medium,
    borderWidth: 1,
    borderRadius: Raio.small,
    justifyContent: 'center',
  },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Espacamento.small,
    height: 44,
    paddingHorizontal: Espacamento.medium,
    borderWidth: 1,
    borderRadius: Raio.small,
  },
  pressionado: {
    opacity: 0.7,
  },
  aviso: {
    flexDirection: 'row',
    gap: Espacamento.medium,
  },
  avisoTexto: {
    flex: 1,
    gap: Espacamento.xsmall,
  },
});
