import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SeletorRestaurante } from '@/components/dashboard/formularios';
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
import { listarRestaurantes, type Restaurante } from '@/services/api-produtos';
import { calcularRota, exportarRota, listarPedidosParaRota } from '@/services/api-rotas';

const INTERVALO_ATUALIZACAO_MS = 10_000;

export default function PlanejarRota() {
  const cores = useCores();
  const largura = useLarguraConteudo();
  const duasColunas = largura >= 800;

  const [nome, setNome] = useState('Rota Centro');
  const [transporte, setTransporte] = useState<MeioTransporte>('moto');
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([]);
  const [restauranteId, setRestauranteId] = useState<number>();
  // Pedidos prontos do restaurante (fonte das paradas) e os que estão na rota, em ordem
  const [prontos, setProntos] = useState<Parada[] | null>(null);
  const [paradas, setParadas] = useState<Parada[]>([]);
  // A rota calculada vale para a sequência em que foi feita (chave)
  const [rota, setRota] = useState<{ chave: string; dados: RotaCalculada } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [exportada, setExportada] = useState<{ url: string; pedidoIds: number[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Restaurante cuja rota já foi preenchida com os prontos (só acontece uma vez por restaurante)
  const preenchida = useRef<number | null>(null);
  const ultimaCarga = useRef(0);
  const operacaoEmCurso = useRef(false);

  useEffect(() => {
    listarRestaurantes()
      .then((dados) => { setRestaurantes(dados); setRestauranteId((atual) => atual ?? dados[0]?.id); })
      .catch((e: Error) => setErro(`Restaurantes: ${e.message}`));
  }, []);

  const carregarPedidos = useCallback(async (id: number, aindaAtivo: () => boolean = () => true) => {
    const carga = ++ultimaCarga.current;
    try {
      const dados = await listarPedidosParaRota(id);
      if (!aindaAtivo() || carga !== ultimaCarga.current) return;
      setProntos(dados);
      // Na primeira carga, a rota começa com todos os prontos (até o limite). Depois, mantém
      // a ordem escolhida e só tira da rota quem deixou de estar pronto.
      const primeiraCarga = preenchida.current !== id;
      preenchida.current = id;
      setParadas((atuais) => {
        if (primeiraCarga) return dados.slice(0, MAXIMO_PARADAS);
        const porId = new Map(dados.map((p) => [p.id, p]));
        return atuais.filter((p) => porId.has(p.id)).map((p) => porId.get(p.id)!);
      });
    } catch (e) {
      if (!aindaAtivo() || carga !== ultimaCarga.current) return;
      setErro((e as Error).message);
      setProntos((atuais) => atuais ?? []);
    }
  }, []);

  useEffect(() => {
    if (restauranteId === undefined) return;
    let ativo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carregarPedidos atualiza o estado somente após a resposta HTTP.
    carregarPedidos(restauranteId, () => ativo);
    const intervalo = setInterval(() => carregarPedidos(restauranteId, () => ativo), INTERVALO_ATUALIZACAO_MS);
    return () => { ativo = false; clearInterval(intervalo); };
  }, [restauranteId, carregarPedidos]);

  const restaurante = restaurantes.find((r) => r.id === restauranteId);
  const partida: PontoPartida | null = restaurante
    ? { nome: restaurante.nome, endereco: [restaurante.endereco, restaurante.cidade].filter(Boolean).join(' • ') }
    : null;
  const disponiveis = (prontos ?? []).filter((p) => !paradas.some((r) => r.id === p.id));
  const pedidoIds = paradas.map((p) => p.id);
  const chave = `${restauranteId}|${transporte}|${pedidoIds.join(',')}`;
  const rotaAtual = rota?.chave === chave ? rota.dados : null;
  const ocupado = calculando || exportando;

  const visualizar = async () => {
    if (operacaoEmCurso.current || restauranteId === undefined || pedidoIds.length === 0) return;
    operacaoEmCurso.current = true;
    setCalculando(true); setErro(null);
    try {
      const dados = await calcularRota({ restauranteId, pedidoIds, transporte });
      setRota({ chave, dados });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      operacaoEmCurso.current = false;
      setCalculando(false);
    }
  };

  const exportar = async () => {
    if (operacaoEmCurso.current || restauranteId === undefined || pedidoIds.length === 0) return;
    operacaoEmCurso.current = true;
    setExportando(true); setErro(null);
    try {
      const resultado = await exportarRota({ restauranteId, pedidoIds, transporte });
      setExportada(resultado);
      // Os pedidos exportados saem dos prontos; a próxima rota começa com os que sobraram
      preenchida.current = null;
      await carregarPedidos(restauranteId);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      operacaoEmCurso.current = false;
      setExportando(false);
    }
  };

  return (
    <Pagina
      titulo="Planejar rota"
      subtitulo="Monte a rota com os pedidos prontos, confira o percurso no mapa e envie ao entregador.">
      <SeletorRestaurante restaurantes={restaurantes} valor={restauranteId} desabilitado={ocupado} onChange={(id) => {
        ultimaCarga.current += 1;
        setProntos(null); setParadas([]); setRota(null); setExportada(null); setErro(null); setRestauranteId(id);
      }} />
      <RotaFormulario nome={nome} onNome={setNome} transporte={transporte} onTransporte={setTransporte} desabilitado={ocupado} />

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
            calculando={calculando}
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
