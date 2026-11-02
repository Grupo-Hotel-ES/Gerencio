import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Botao, Cartao, Chip, Divisor, Icone, Texto } from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import { type Parada, type PontoPartida } from '@/data/rotas';
import { useCores } from '@/hooks/use-cores';

/** Selo amarelo com o número da parada. */
export function SeloNumero({ numero, tamanho = 32 }: { numero: number; tamanho?: number }) {
  const cores = useCores();
  return (
    <View style={[styles.selo, { width: tamanho, height: tamanho, backgroundColor: cores.brand }]}>
      <Texto peso={600} cor="textOnBrand">
        {numero}
      </Texto>
    </View>
  );
}

type Props = {
  partida: PontoPartida;
  onPartida: (partida: PontoPartida) => void;
  paradas: Parada[];
  onParadas: (paradas: Parada[]) => void;
  onVisualizar: () => void;
};

/** Ponto de partida e lista ordenada de paradas. A ordem muda pelos botões subir/descer. */
export function RotaParadas({ partida, onPartida, paradas, onParadas, onVisualizar }: Props) {
  const cores = useCores();
  const [editandoPartida, setEditandoPartida] = useState(false);

  const estiloEntrada = [styles.entrada, { color: cores.textoPrincipal, borderColor: cores.borda, fontFamily: Fonts?.sans }];

  const atualizar = (id: number, campo: 'cliente' | 'endereco' | 'complemento', valor: string) =>
    onParadas(paradas.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));

  const mover = (indice: number, delta: -1 | 1) => {
    const destino = indice + delta;
    if (destino < 0 || destino >= paradas.length) return;
    const novas = [...paradas];
    [novas[indice], novas[destino]] = [novas[destino], novas[indice]];
    onParadas(novas);
  };

  const remover = (id: number) => onParadas(paradas.filter((p) => p.id !== id));

  const adicionar = () =>
    onParadas([...paradas, { id: Date.now(), cliente: '', endereco: '', complemento: '' }]);

  return (
    <Cartao style={styles.cartao}>
      <View style={styles.linha}>
        <Texto tamanho={18} peso={500}>Sequência de paradas</Texto>
        <Chip rotulo={paradas.length === 1 ? '1 parada' : paradas.length + ' paradas'} />
      </View>
      <Texto tamanho={13} cor="textoSecundario">
        Use as setas para alterar a ordem. O mapa segue a sequência abaixo.
      </Texto>

      <Texto peso={600}>Ponto de partida</Texto>
      <View style={[styles.partida, { borderColor: cores.borda, backgroundColor: cores.fundo }]}>
        <Icone nome="loja" />
        <View style={styles.partidaTexto}>
          <Texto peso={600}>{partida.nome}</Texto>
          {editandoPartida ? (
            <TextInput
              accessibilityLabel="Endereço do ponto de partida"
              value={partida.endereco}
              onChangeText={(endereco) => onPartida({ ...partida, endereco })}
              style={estiloEntrada}
            />
          ) : (
            <Texto tamanho={13} cor="textoSecundario">{partida.endereco}</Texto>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editandoPartida ? 'Concluir edição do ponto de partida' : 'Editar ponto de partida'}
          onPress={() => setEditandoPartida(!editandoPartida)}
          hitSlop={8}>
          <Icone nome={editandoPartida ? 'check' : 'editar'} />
        </Pressable>
      </View>

      <Divisor />

      {paradas.map((parada, indice) => (
        <View key={parada.id} style={styles.parada}>
          <View style={styles.linha}>
            <View style={styles.ordem}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Subir parada ' + (indice + 1)}
                disabled={indice === 0}
                onPress={() => mover(indice, -1)}
                hitSlop={6}
                style={indice === 0 && styles.desativado}>
                <Icone nome="subir" tamanho={16} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Descer parada ' + (indice + 1)}
                disabled={indice === paradas.length - 1}
                onPress={() => mover(indice, 1)}
                hitSlop={6}
                style={indice === paradas.length - 1 && styles.desativado}>
                <Icone nome="seta" tamanho={16} />
              </Pressable>
            </View>
            <SeloNumero numero={indice + 1} />
            <TextInput
              accessibilityLabel={'Cliente da parada ' + (indice + 1)}
              value={parada.cliente}
              onChangeText={(valor) => atualizar(parada.id, 'cliente', valor)}
              placeholder="Nome do cliente"
              placeholderTextColor={cores.textoSecundario}
              style={[styles.cliente, { color: cores.textoPrincipal, fontFamily: Fonts?.sans }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={'Remover parada ' + (indice + 1)}
              onPress={() => remover(parada.id)}
              hitSlop={8}>
              <Icone nome="fechar" tamanho={18} />
            </Pressable>
          </View>
          <View style={[styles.enderecoCampo, { borderColor: cores.borda }]}>
            <TextInput
              accessibilityLabel={'Endereço da parada ' + (indice + 1)}
              value={parada.endereco}
              onChangeText={(valor) => atualizar(parada.id, 'endereco', valor)}
              placeholder="Rua, número"
              placeholderTextColor={cores.textoSecundario}
              style={[styles.enderecoEntrada, { color: cores.textoPrincipal, fontFamily: Fonts?.sans }]}
            />
            <Icone nome="busca" tamanho={18} />
          </View>
          <TextInput
            accessibilityLabel={'Complemento da parada ' + (indice + 1)}
            value={parada.complemento}
            onChangeText={(valor) => atualizar(parada.id, 'complemento', valor)}
            placeholder="Bairro • complemento"
            placeholderTextColor={cores.textoSecundario}
            style={[styles.complemento, { color: cores.textoSecundario, fontFamily: Fonts?.sans }]}
          />
        </View>
      ))}

      {paradas.length === 0 && (
        <Texto cor="textoSecundario">Nenhuma parada na rota. Adicione a primeira entrega.</Texto>
      )}

      <Botao rotulo="Adicionar parada" icone="mais" onPress={adicionar} />
      <Divisor />
      <Botao rotulo="Visualizar rota no mapa" icone="mapa" variante="primario" disabled={paradas.length === 0} onPress={onVisualizar} />
      <Texto tamanho={13} cor="textoSecundario">
        Ao editar os endereços ou a ordem, visualize a rota novamente.
      </Texto>
    </Cartao>
  );
}

const styles = StyleSheet.create({
  cartao: { gap: Espacamento.medium },
  linha: { flexDirection: 'row', alignItems: 'center', gap: Espacamento.small },
  selo: { alignItems: 'center', justifyContent: 'center', borderRadius: Raio.small },
  partida: { flexDirection: 'row', alignItems: 'center', gap: Espacamento.medium, padding: Espacamento.medium, borderWidth: 1, borderRadius: Raio.small },
  partidaTexto: { flex: 1, gap: Espacamento.xsmall },
  parada: { gap: Espacamento.small },
  ordem: { alignItems: 'center', gap: Espacamento.xsmall },
  desativado: { opacity: 0.3 },
  cliente: { flex: 1, fontSize: 14, fontWeight: '600', paddingVertical: Espacamento.xsmall },
  entrada: { minHeight: 40, borderWidth: 1, borderRadius: Raio.small, paddingHorizontal: Espacamento.medium, fontSize: 14 },
  enderecoCampo: { flexDirection: 'row', alignItems: 'center', gap: Espacamento.small, minHeight: 44, borderWidth: 1, borderRadius: Raio.small, paddingHorizontal: Espacamento.medium },
  enderecoEntrada: { flex: 1, fontSize: 16, minHeight: 44 },
  complemento: { fontSize: 13, paddingVertical: Espacamento.xsmall },
});
