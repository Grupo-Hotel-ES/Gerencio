import { StyleSheet, TextInput, View } from 'react-native';

import { Cartao, Chip, Icone, Texto } from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import { MEIOS_TRANSPORTE, type MeioTransporte } from '@/data/rotas';
import { useCores } from '@/hooks/use-cores';

type Props = {
  nome: string;
  onNome: (nome: string) => void;
  transporte: MeioTransporte;
  onTransporte: (meio: MeioTransporte) => void;
};

/** Nome da rota e meio de transporte. */
export function RotaFormulario({ nome, onNome, transporte, onTransporte }: Props) {
  const cores = useCores();

  return (
    <Cartao style={styles.cartao}>
      <View style={styles.campo}>
        <Texto peso={600}>Nome da rota</Texto>
        <TextInput
          accessibilityLabel="Nome da rota"
          value={nome}
          onChangeText={onNome}
          placeholder="Ex.: Rota Centro"
          placeholderTextColor={cores.textoSecundario}
          style={[styles.entrada, { color: cores.textoPrincipal, borderColor: cores.borda, fontFamily: Fonts?.sans }]}
        />
      </View>
      <View style={styles.campo}>
        <View style={styles.titulo}>
          <Icone nome="motoboy" />
          <Texto peso={600}>Meio de transporte</Texto>
        </View>
        <View style={styles.chips}>
          {MEIOS_TRANSPORTE.map(({ id, rotulo }) => (
            <Chip key={id} rotulo={rotulo} ativo={transporte === id} onPress={() => onTransporte(id)} />
          ))}
        </View>
      </View>
    </Cartao>
  );
}

const styles = StyleSheet.create({
  cartao: { flexDirection: 'row', flexWrap: 'wrap', gap: Espacamento.large },
  campo: { flex: 1, minWidth: 240, gap: Espacamento.small },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: Espacamento.small },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Espacamento.small },
  entrada: { minHeight: 44, borderWidth: 1, borderRadius: Raio.small, paddingHorizontal: Espacamento.medium, fontSize: 16 },
});
