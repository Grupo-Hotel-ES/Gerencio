import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Chip, Texto } from './ui';
import { Espacamento, Raio } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';
import type { Restaurante } from '@/services/api-produtos';

export function Campo({ rotulo, ...props }: TextInputProps & { rotulo: string }) {
  const cores = useCores();
  return (
    <View style={styles.campo}>
      <Texto peso={500}>{rotulo}</Texto>
      <TextInput accessibilityLabel={rotulo} placeholderTextColor={cores.textoSecundario}
        style={[styles.entrada, { color: cores.textoPrincipal, borderColor: cores.borda, backgroundColor: cores.superficie }]} {...props} />
    </View>
  );
}

export function SeletorRestaurante({ restaurantes, valor, onChange, todos = false, desabilitado = false }: {
  restaurantes: Restaurante[];
  valor?: number;
  onChange: (id: number | undefined) => void;
  todos?: boolean;
  desabilitado?: boolean;
}) {
  return (
    <View style={styles.campo}>
      <Texto peso={500}>Restaurante</Texto>
      <View style={styles.opcoes}>
        {todos && <Chip rotulo="Todos os restaurantes" ativo={valor === undefined} onPress={desabilitado || valor === undefined ? undefined : () => onChange(undefined)} />}
        {restaurantes.map((restaurante) => <Chip key={restaurante.id} rotulo={restaurante.nome}
          ativo={restaurante.id === valor} onPress={desabilitado || restaurante.id === valor ? undefined : () => onChange(restaurante.id)} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  campo: { gap: Espacamento.small },
  entrada: { borderWidth: 1, borderRadius: Raio.small, padding: Espacamento.medium, minHeight: 44, fontSize: 16 },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: Espacamento.small },
});
