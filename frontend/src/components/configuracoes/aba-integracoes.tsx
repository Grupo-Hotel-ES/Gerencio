import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Aviso, Botao, Cartao, Etiqueta, Texto } from '@/components/dashboard/ui';
import { Espacamento } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';
import { nomeDoCanal, requisitar } from '@/services/api-pedidos';

// Canais que mandam pedidos para o Gerêncio (o balcão é lançado no próprio painel)
const CANAIS: { app: string; origem: string }[] = [
  { app: 'whatsapp', origem: 'Chatbot do WhatsApp (n8n + Evolution API)' },
  { app: 'ifood', origem: 'Webhook /api/webhooks/ifood (api-integracao)' },
  { app: '99food', origem: 'Webhook /api/webhooks/99food (api-integracao)' },
  { app: 'ubereats', origem: 'Webhook /api/webhooks/ubereats (api-integracao)' },
  { app: 'rappi', origem: 'Webhook /api/webhooks/rappi (api-integracao)' },
  { app: 'keeta', origem: 'Webhook /api/webhooks/keeta (api-integracao)' },
];

type Resumo = { total: number; ultimo: Date | null };

function formatarData(data: Date) {
  return data.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Situação de cada canal a partir dos pedidos que ele já entregou ao Gerêncio. */
export function AbaIntegracoes() {
  const cores = useCores();
  const [resumo, setResumo] = useState<Record<string, Resumo> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    requisitar<{ app: string; criadoEm: string }[]>('/pedidos')
      .then((pedidos) => {
        if (!ativo) return;
        const porCanal: Record<string, Resumo> = {};
        for (const pedido of pedidos) {
          const app = pedido.app.toLowerCase();
          const atual = porCanal[app] ?? { total: 0, ultimo: null };
          const criado = new Date(pedido.criadoEm);
          porCanal[app] = { total: atual.total + 1, ultimo: !atual.ultimo || criado > atual.ultimo ? criado : atual.ultimo };
        }
        setResumo(porCanal); setErro(null);
      })
      .catch((e: Error) => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [versao]);

  return (
    <View style={styles.coluna}>
      <Aviso
        icone="info"
        titulo="Como os pedidos chegam"
        texto="Cada plataforma envia os pedidos por webhook para a api-integracao, que traduz os produtos pelos códigos cadastrados no Estoque. Os dados abaixo vêm dos pedidos já recebidos."
      />
      {erro && <Texto cor="feedbackErro" accessibilityRole="alert">{erro}</Texto>}
      {!resumo && !erro && <ActivityIndicator color={cores.textoPrincipal} />}

      {resumo && (
        <View style={styles.grade}>
          {CANAIS.map(({ app, origem }) => {
            const dados = resumo[app];
            return (
              <Cartao key={app} style={styles.cartao}>
                <View style={styles.cabecalho}>
                  <Texto tamanho={18} peso={600}>{nomeDoCanal(app)}</Texto>
                  <Etiqueta
                    rotulo={dados ? 'Recebendo pedidos' : 'Sem pedidos'}
                    corPonto={dados ? cores.statusEntregue : cores.statusCancelado}
                  />
                </View>
                <Texto tamanho={13} cor="textoSecundario">
                  {dados?.ultimo ? `Último pedido: ${formatarData(dados.ultimo)}` : 'Nenhum pedido recebido ainda'}
                </Texto>
                <Texto tamanho={13} cor="textoSecundario">
                  {dados ? `${dados.total} ${dados.total === 1 ? 'pedido' : 'pedidos'} no total` : '—'}
                </Texto>
                <Texto tamanho={12} cor="textoSecundario">{origem}</Texto>
              </Cartao>
            );
          })}
        </View>
      )}

      <Botao rotulo="Atualizar" icone="sincronizar" onPress={() => { setResumo(null); setVersao((v) => v + 1); }} style={styles.botao} />
    </View>
  );
}

const styles = StyleSheet.create({
  coluna: { gap: Espacamento.large },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: Espacamento.large },
  cartao: { flexBasis: '31%', flexGrow: 1, minWidth: 220, gap: Espacamento.small },
  cabecalho: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Espacamento.small },
  botao: { alignSelf: 'flex-start' },
});
