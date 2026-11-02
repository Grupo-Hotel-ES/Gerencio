import { openBrowserAsync } from 'expo-web-browser';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { QrCode } from './qr-code';
import { Botao, Cartao, Divisor, Etiqueta, Texto } from './ui';

import { Espacamento, Raio } from '@/constants/tokens';
import { COR_PAGAMENTO, formatarHora, formatarReais, STATUS, type Pedido } from '@/data/pedidos';
import { useCores } from '@/hooks/use-cores';
import { gerarLinkPagamentoPedido, type LinkPagamentoPedido } from '@/services/api-pagamentos';

export function OrderCard({ pedido, onAvancar, onCancelar, ocupado = false, pagamentoOnline = false }: {
  pedido: Pedido; onAvancar: () => void; onCancelar: () => void; ocupado?: boolean;
  /** Stripe configurado na api-pagamentos. */
  pagamentoOnline?: boolean;
}) {
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  const [link, setLink] = useState<LinkPagamentoPedido | null>(null);
  const [gerandoLink, setGerandoLink] = useState(false);
  const [erroLink, setErroLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const cores = useCores();
  const pago = pedido.pagamento.tipo === 'pago';
  const podeGerarLink = pagamentoOnline && pedido.aceitaLinkPagamento && !pago;
  const podeCopiar = Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.clipboard;

  const gerarLink = async () => {
    setGerandoLink(true);
    setErroLink(null);
    try {
      setLink(await gerarLinkPagamentoPedido(pedido.numero));
    } catch (e) {
      setErroLink((e as Error).message);
    } finally {
      setGerandoLink(false);
    }
  };

  const copiarLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };
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

      <Etiqueta rotulo={pedido.pagamento.rotulo} corPonto={cores[COR_PAGAMENTO[pedido.pagamento.tipo]]} />

      <Divisor />

      <View style={styles.linha}>
        <Etiqueta rotulo={status.rotulo} corPonto={corStatus} />
        <View style={styles.valores}>
          <Texto tamanho={17} peso={500}>
            {formatarReais(pedido.total)}
          </Texto>
          {pedido.taxaEntrega > 0 && (
            <Texto tamanho={12} cor="textoSecundario">
              inclui entrega de {formatarReais(pedido.taxaEntrega)}
            </Texto>
          )}
        </View>
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
      {link ? (
        <View style={[styles.painelLink, { borderColor: cores.borda }]}>
          {pago ? (
            <Texto peso={500} cor="statusEntregue" style={styles.centro}>Pagamento confirmado</Texto>
          ) : (
            <>
              <Texto peso={500} style={styles.centro}>Escaneie para pagar com cartão ou Pix</Texto>
              <QrCode valor={link.url} />
              <Texto tamanho={13} cor="textoSecundario" style={styles.centro}>
                {formatarReais(Number(link.valor))} • válido até {formatarHora(new Date(link.expiraEm))}
              </Texto>
              {podeCopiar && (
                <Botao rotulo={copiado ? 'Link copiado' : 'Copiar link'} icone="copiar" onPress={copiarLink} />
              )}
              <Botao rotulo="Abrir página de pagamento" icone="setaDireita" onPress={() => openBrowserAsync(link.url)} />
            </>
          )}
          <Botao rotulo="Fechar" onPress={() => setLink(null)} />
        </View>
      ) : podeGerarLink && (
        <Botao
          rotulo={gerandoLink ? 'Gerando link…' : 'Gerar link de pagamento'}
          icone="pix"
          disabled={gerandoLink}
          onPress={gerarLink}
        />
      )}
      {erroLink && <Texto tamanho={13} cor="feedbackErro" accessibilityRole="alert">{erroLink}</Texto>}
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
  valores: {
    alignItems: 'flex-end',
  },
  painelLink: {
    gap: Espacamento.medium,
    padding: Espacamento.medium,
    borderWidth: 1,
    borderRadius: Raio.small,
  },
  centro: {
    textAlign: 'center',
  },
});
