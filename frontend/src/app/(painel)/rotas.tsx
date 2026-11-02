import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import { RotaFormulario } from '@/components/dashboard/rota-formulario';
import { RotaMapa } from '@/components/dashboard/rota-mapa';
import { RotaParadas } from '@/components/dashboard/rota-paradas';
import { RotaResumo } from '@/components/dashboard/rota-resumo';
import { Botao, Cartao, Texto } from '@/components/dashboard/ui';
import { Espacamento } from '@/constants/tokens';
import {
  MAXIMO_PARADAS, type MeioTransporte, type Parada, type PontoPartida, type RotaCalculada,
} from '@/data/rotas';
import { useCores } from '@/hooks/use-cores';
import { usePerfil } from '@/data/perfil-context';
import { calcularRota, exportarRota, listarPedidosParaRota } from '@/services/api-rotas';

const INTERVALO_ATUALIZACAO_MS = 10_000;

export default function PlanejarRota() {
  const cores = useCores();
  const largura = useLarguraConteudo();
  const duasColunas = largura >= 800;

  const [nome, setNome] = useState('Rota Centro');
  const [transporte, setTransporte] = useState<MeioTransporte>('moto');
  const { restaurante } = usePerfil();
  // Pedidos prontos (fonte das paradas) e os que estão na rota, em ordem
  const [prontos, setProntos] = useState<Parada[] | null>(null);
  const [paradas, setParadas] = useState<Parada[]>([]);
  // A rota calculada vale para a sequência em que foi feita (chave)
  const [rota, setRota] = useState<{ chave: string; dados: RotaCalculada } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [exportada, setExportada] = useState<{ url: string; pedidoIds: number[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // A rota começa com todos os prontos só na primeira carga (e de novo depois de exportar)
  const preenchida = useRef(false);

  const carregarPedidos = useCallback(async () => {
    try {
      const dados = await listarPedidosParaRota();
      setProntos(dados);
      // Na primeira carga, a rota começa com todos os prontos (até o limite). Depois, mantém
      // a ordem escolhida e só tira da rota quem deixou de estar pronto.
      const primeiraCarga = !preenchida.current;
      preenchida.current = true;
      setParadas((atuais) => {
        if (primeiraCarga) return dados.slice(0, MAXIMO_PARADAS);
        const porId = new Map(dados.map((p) => [p.id, p]));
        return atuais.filter((p) => porId.has(p.id)).map((p) => porId.get(p.id)!);
      });
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carregarPedidos atualiza o estado somente após a resposta HTTP.
    carregarPedidos();
    const intervalo = setInterval(carregarPedidos, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(intervalo);
  }, [carregarPedidos]);

  const partida: PontoPartida | null = restaurante
    ? {
        nome: restaurante.nome,
        endereco: [[restaurante.logradouro, restaurante.numero].filter(Boolean).join(', '), restaurante.cidade].filter(Boolean).join(' • '),
      }
    : null;
  const disponiveis = (prontos ?? []).filter((p) => !paradas.some((r) => r.id === p.id));
  const pedidoIds = paradas.map((p) => p.id);
  const chave = `${transporte}|${pedidoIds.join(',')}`;
  const rotaAtual = rota?.chave === chave ? rota.dados : null;
  const ocupado = calculando || exportando;

  const visualizar = async () => {
    if (pedidoIds.length === 0) return;
    setCalculando(true); setErro(null);
    try {
      const dados = await calcularRota({ pedidoIds, transporte });
      setRota({ chave, dados });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCalculando(false);
    }
  };

  const exportar = async () => {
    if (pedidoIds.length === 0) return;
    setExportando(true); setErro(null);
    try {
      const resultado = await exportarRota({ pedidoIds, transporte });
      setExportada(resultado);
      // Os pedidos exportados saem dos prontos; a próxima rota começa com os que sobraram
      preenchida.current = false;
      await carregarPedidos();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setExportando(false);
    }
  };

  return (
    <Pagina
      titulo="Planejar rota"
      subtitulo="Monte a rota com os pedidos prontos, confira o percurso no mapa e envie ao entregador.">
      <RotaFormulario nome={nome} onNome={setNome} transporte={transporte} onTransporte={setTransporte} />

      {erro && (
        <Cartao style={[styles.erro, { borderColor: cores.feedbackErro }]}>
          <Texto accessibilityRole="alert" style={styles.flex}>{erro}</Texto>
          <Botao rotulo="Fechar" onPress={() => setErro(null)} />
        </Cartao>
      )}

      <View style={[styles.colunas, duasColunas && styles.colunasLado]}>
        <View style={duasColunas ? styles.esquerda : styles.coluna}>
          <RotaParadas
            partida={partida}
            paradas={paradas}
            disponiveis={disponiveis}
            onParadas={setParadas}
            onVisualizar={visualizar}
            carregando={prontos === null}
            ocupado={ocupado}
          />
        </View>
        <View style={duasColunas ? styles.direita : styles.coluna}>
          <RotaMapa rota={rotaAtual} calculando={calculando} altura={duasColunas ? 460 : 340} />
          <RotaResumo
            partida={partida}
            paradas={paradas}
            rota={rotaAtual}
            onExportar={exportar}
            exportando={exportando}
            exportada={exportada}
            onFecharExportacao={() => { setExportada(null); setRota(null); }}
          />
        </View>
      </View>
    </Pagina>
  );
}

const styles = StyleSheet.create({
  colunas: { gap: Espacamento.large },
  colunasLado: { flexDirection: 'row', alignItems: 'flex-start' },
  coluna: { gap: Espacamento.large },
  esquerda: { flex: 4, minWidth: 340 },
  direita: { flex: 7, gap: Espacamento.large },
  erro: { flexDirection: 'row', alignItems: 'center', gap: Espacamento.medium },
  flex: { flex: 1 },
});
