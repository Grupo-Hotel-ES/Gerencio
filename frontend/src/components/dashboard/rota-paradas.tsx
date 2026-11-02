import { Pressable, StyleSheet, View } from 'react-native';

import { Botao, Cartao, Chip, Divisor, Icone, Texto } from '@/components/dashboard/ui';
import { Espacamento, Raio } from '@/constants/tokens';
import { MAXIMO_PARADAS, type Parada, type PontoPartida } from '@/data/rotas';
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
  partida: PontoPartida | null;
  /** Pedidos na rota, na ordem de entrega. */
  paradas: Parada[];
  /** Pedidos prontos que ainda não estão na rota. */
  disponiveis: Parada[];
  onParadas: (paradas: Parada[]) => void;
  onVisualizar: () => void;
  carregando: boolean;
  ocupado: boolean;
};

/** Ponto de partida (restaurante) e a sequência de pedidos prontos. A ordem muda pelos botões subir/descer. */
export function RotaParadas({ partida, paradas, disponiveis, onParadas, onVisualizar, carregando, ocupado }: Props) {
  const cores = useCores();
  const cheia = paradas.length >= MAXIMO_PARADAS;

  const mover = (indice: number, delta: -1 | 1) => {
    const destino = indice + delta;
    if (destino < 0 || destino >= paradas.length) return;
    const novas = [...paradas];
    [novas[indice], novas[destino]] = [novas[destino], novas[indice]];
    onParadas(novas);
  };

  const remover = (id: number) => onParadas(paradas.filter((p) => p.id !== id));
  const adicionar = (parada: Parada) => onParadas([...paradas, parada]);

  return (
    <Cartao style={styles.cartao}>
      <View style={styles.linha}>
        <Texto tamanho={18} peso={500} style={styles.flex}>Sequência de paradas</Texto>
        <Chip rotulo={paradas.length === 1 ? '1 parada' : paradas.length + ' paradas'} />
      </View>
      <Texto tamanho={13} cor="textoSecundario">
        As paradas são os pedidos prontos para entrega. Use as setas para alterar a ordem.
      </Texto>

      <Texto peso={600}>Ponto de partida</Texto>
      <View style={[styles.partida, { borderColor: cores.borda, backgroundColor: cores.fundo }]}>
        <Icone nome="loja" />
        <View style={styles.flex}>
          <Texto peso={600}>{partida?.nome ?? 'Selecione um restaurante'}</Texto>
          {partida && <Texto tamanho={13} cor="textoSecundario">{partida.endereco}</Texto>}
        </View>
      </View>

      <Divisor />

      {paradas.map((parada, indice) => (
        <View key={parada.id} style={styles.linha}>
          <View style={styles.ordem}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={'Subir parada ' + (indice + 1)}
              disabled={ocupado || indice === 0}
              onPress={() => mover(indice, -1)}
              hitSlop={6}
              style={indice === 0 && styles.desativado}>
              <Icone nome="subir" tamanho={16} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={'Descer parada ' + (indice + 1)}
              disabled={ocupado || indice === paradas.length - 1}
              onPress={() => mover(indice, 1)}
              hitSlop={6}
              style={indice === paradas.length - 1 && styles.desativado}>
              <Icone nome="seta" tamanho={16} />
            </Pressable>
          </View>
          <SeloNumero numero={indice + 1} />
          <View style={styles.flex}>
            <Texto peso={600}>#{parada.id} • {parada.cliente}</Texto>
            <Texto tamanho={14}>{parada.endereco}</Texto>
            <Texto tamanho={13} cor="textoSecundario">{parada.complemento}</Texto>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Tirar o pedido ' + parada.id + ' da rota'}
            disabled={ocupado}
            onPress={() => remover(parada.id)}
            hitSlop={8}>
            <Icone nome="fechar" tamanho={18} />
          </Pressable>
        </View>
      ))}

      {paradas.length === 0 && (
        <Texto cor="textoSecundario">
          {carregando ? 'Carregando pedidos prontos…' : 'Nenhum pedido na rota. Adicione um pedido pronto abaixo.'}
        </Texto>
      )}

      {disponiveis.length > 0 && (
        <>
          <Divisor />
          <Texto peso={600}>Pedidos prontos fora da rota</Texto>
          {disponiveis.map((parada) => (
            <View key={parada.id} style={styles.linha}>
              <View style={styles.flex}>
                <Texto peso={500}>#{parada.id} • {parada.cliente}</Texto>
                <Texto tamanho={13} cor="textoSecundario">{parada.endereco} • {parada.complemento}</Texto>
              </View>
              <Botao rotulo="Adicionar" icone="mais" disabled={ocupado || cheia} onPress={() => adicionar(parada)} />
            </View>
          ))}
          {cheia && (
            <Texto tamanho={13} cor="textoSecundario">
              A rota aceita até {MAXIMO_PARADAS} paradas (limite do link do Google Maps).
            </Texto>
          )}
        </>
      )}

      <Divisor />
      <Botao rotulo="Visualizar rota no mapa" icone="mapa" variante="primario" disabled={ocupado || paradas.length === 0} onPress={onVisualizar} />
      <Texto tamanho={13} cor="textoSecundario">
        Ao mudar os pedidos ou a ordem, visualize a rota novamente.
      </Texto>
    </Cartao>
  );
}

const styles = StyleSheet.create({
  cartao: { gap: Espacamento.medium },
  linha: { flexDirection: 'row', alignItems: 'center', gap: Espacamento.small },
  flex: { flex: 1, gap: Espacamento.xsmall },
  selo: { alignItems: 'center', justifyContent: 'center', borderRadius: Raio.small },
  partida: { flexDirection: 'row', alignItems: 'center', gap: Espacamento.medium, padding: Espacamento.medium, borderWidth: 1, borderRadius: Raio.small },
  ordem: { alignItems: 'center', gap: Espacamento.xsmall },
  desativado: { opacity: 0.3 },
});
