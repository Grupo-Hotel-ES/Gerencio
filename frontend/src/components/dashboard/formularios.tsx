import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Texto } from './ui';
import { Espacamento, Raio } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';

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

const styles = StyleSheet.create({
  campo: { gap: Espacamento.small },
  entrada: { borderWidth: 1, borderRadius: Raio.small, padding: Espacamento.medium, minHeight: 44, fontSize: 16 },
});
