import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Botao, Cartao, Divisor, Etiqueta, Texto } from './ui';

import { Espacamento, Raio } from '@/constants/tokens';
import { formatarReais, STATUS, type Pedido } from '@/data/pedidos';
import { useCores } from '@/hooks/use-cores';

export function OrderCard({ pedido, onAvancar, onCancelar, ocupado = false }: {
  pedido: Pedido; onAvancar: () => void; onCancelar: () => void; ocupado?: boolean;
}) {
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  const cores = useCores();
  const status = STATUS[pedido.status];
  const corStatus = cores[status.cor];
  const primario = pedido.status === 'novo';

  return (
    <Cartao style={styles.container}>
      <View style={[styles.faixa, { backgroundColor: corStatus }]} />

      <View style={styles.linha}>
        <Texto tamanho={18} peso={500}>
          #{pedido.numero}
        </Texto>
        <Etiqueta rotulo={pedido.canal} corPonto={cores.textoSecundario} />
      </View>

      <Texto tamanho={13} cor="textoSecundario">{pedido.restaurante}</Texto>

      <View style={styles.linha}>
        <Texto tamanho={16} peso={500}>
          {pedido.cliente}
        </Texto>
        <Texto tamanho={13} cor="textoSecundario">
          {pedido.horario}
        </Texto>
      </View>

      <View style={styles.itens}>
        {pedido.itens.map((item) => (
          <Texto key={item} tamanho={16} style={styles.item}>
            {item}
          </Texto>
        ))}
      </View>

      <Texto tamanho={13} cor="textoSecundario">
        {pedido.entrega}
      </Texto>

      <Divisor />

      <View style={styles.linha}>
        <Etiqueta rotulo={status.rotulo} corPonto={corStatus} />
        <Texto tamanho={17} peso={500}>
          {formatarReais(pedido.total)}
        </Texto>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onAvancar}
        disabled={ocupado}
        accessibilityState={{ disabled: ocupado }}
        style={({ pressed }) => [
          styles.botao,
          primario
            ? { backgroundColor: cores.brand, borderColor: cores.brand }
            : { backgroundColor: cores.superficie, borderColor: cores.borda },
          pressed && styles.pressionado,
        ]}>
        <Texto peso={500} cor={primario ? 'textOnBrand' : 'textoPrincipal'}>
          {ocupado ? 'Salvando…' : status.acao}
        </Texto>
      </Pressable>
      {pedido.status !== 'saiu_para_entrega' && (confirmarCancelamento ? (
        <View style={styles.itens}>
          <Texto>{pedido.status === 'novo' ? 'Cancelar este pedido?' : 'Cancelar este pedido e devolver as unidades reservadas ao estoque?'}</Texto>
          <Botao rotulo="Confirmar cancelamento" disabled={ocupado} onPress={onCancelar} />
          <Botao rotulo="Manter pedido" disabled={ocupado} onPress={() => setConfirmarCancelamento(false)} />
        </View>
      ) : <Botao rotulo="Cancelar pedido" disabled={ocupado} onPress={() => setConfirmarCancelamento(true)} />)}
    </Cartao>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Espacamento.large,
  },
  faixa: {
    height: 4,
    borderRadius: 2,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.small,
  },
  itens: {
    // Reserva duas linhas para manter os cartões alinhados.
    minHeight: 44,
  },
  item: {
    lineHeight: 22,
  },
  botao: {
    height: 44,
    borderWidth: 1,
    borderRadius: Raio.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressionado: {
    opacity: 0.7,
  },
});
