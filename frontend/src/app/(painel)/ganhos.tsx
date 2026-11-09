import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Grade, Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import {
  Aviso,
  Botao,
  Cartao,
  Chip,
  Divisor,
  Etiqueta,
  Icone,
  Texto,
} from '@/components/dashboard/ui';
import { Espacamento, Raio } from '@/constants/tokens';
import { MOTOBOYS_DEMO, type Motoboy } from '@/data/motoboys';
import { useCores } from '@/hooks/use-cores';
import {
  atualizarPagamentoEntrega,
  buscarGanhosMotoboy,
  EXTRATO_DEMO_CARLOS,
  quitarEntregasMotoboy,
  type EntregaMotoboyItem,
  type ResumoGanhosMotoboy,
  type StatusPagamentoEntrega,
} from '@/services/api-motoboys';

type FiltroAba = 'todas' | 'pendente' | 'pago';
type AtalhoPeriodo = 'hoje' | '7dias' | 'mes' | 'personalizado';

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}

function formatarKm(distancia: number | null): string {
  if (distancia === null || distancia === undefined) return '0,00';
  return distancia.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarDataBr(dataStr: string): string {
  try {
    const d = new Date(dataStr);
    if (isNaN(d.getTime())) return dataStr;
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dataStr;
  }
}

function formatarHoraBr(dataStr: string): string {
  try {
    const d = new Date(dataStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ControleDeGanhos() {
  const cores = useCores();
  const larguraConteudo = useLarguraConteudo();
  const params = useLocalSearchParams<{ motoboyId?: string }>();

  // Lista de motoboys para o seletor
  const listaMotoboys: Motoboy[] = useMemo(() => {
    return MOTOBOYS_DEMO.map((m) =>
      m.id === 1 ? { ...m, nome: 'Carlos Motoboy SJC' } : m,
    );
  }, []);

  const motoboyInicial = useMemo(() => {
    if (params.motoboyId) {
      const encontrado = listaMotoboys.find((m) => String(m.id) === params.motoboyId);
      if (encontrado) return encontrado;
    }
    return listaMotoboys[0];
  }, [listaMotoboys, params.motoboyId]);

  const [motoboySelecionado, setMotoboySelecionado] = useState<Motoboy>(motoboyInicial);
  const [modalMotoboyAberto, setModalMotoboyAberto] = useState(false);

  // Filtros de período
  const [atalhoPeriodo, setAtalhoPeriodo] = useState<AtalhoPeriodo>('personalizado');
  const [dataInicio, setDataInicio] = useState('01/11/2026');
  const [dataFim, setDataFim] = useState('05/11/2026');

  // Filtro de status da lista
  const [filtroStatus, setFiltroStatus] = useState<FiltroAba>('todas');

  // Entregas e resumo carregados
  const [entregas, setEntregas] = useState<EntregaMotoboyItem[]>(
    EXTRATO_DEMO_CARLOS.entregas,
  );
  const [resumo, setResumo] = useState<ResumoGanhosMotoboy>(
    EXTRATO_DEMO_CARLOS.resumo,
  );
  const [carregando, setCarregando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Recalcula resumo local quando o status de uma entrega muda
  const recalcularResumo = (lista: EntregaMotoboyItem[]) => {
    const pendentes = lista.filter((e) => e.statusPagamento === 'pendente');
    const pagas = lista.filter((e) => e.statusPagamento === 'pago');

    const valorPendente = pendentes.reduce((acc, cur) => acc + cur.valorMotoboy, 0);
    const valorPago = pagas.reduce((acc, cur) => acc + cur.valorMotoboy, 0);
    const valorTotal = valorPendente + valorPago;
    const distanciaTotal = lista.reduce((acc, cur) => acc + (cur.distanciaKm ?? 0), 0);
    const taxaTotal = lista.reduce((acc, cur) => acc + cur.custoEntrega, 0);
    const media = lista.length > 0 ? valorTotal / lista.length : 0;

    setResumo({
      totalEntregas: lista.length,
      entregasPendentes: pendentes.length,
      entregasPagas: pagas.length,
      valorPendenteAReceber: valorPendente,
      valorJaPago: valorPago,
      valorTotalPeriodo: valorTotal,
      taxaTotalCobrada: taxaTotal,
      distanciaTotalKm: Number(distanciaTotal.toFixed(2)),
      mediaPorEntrega: Number(media.toFixed(2)),
    });
  };

  // Carrega dados da API ou demo
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        const partesIni = dataInicio.split('/');
        const partesFim = dataFim.split('/');
        const inicioIso =
          partesIni.length === 3
            ? `${partesIni[2]}-${partesIni[1]}-${partesIni[0]}`
            : undefined;
        const fimIso =
          partesFim.length === 3
            ? `${partesFim[2]}-${partesFim[1]}-${partesFim[0]}`
            : undefined;

        const resposta = await buscarGanhosMotoboy(motoboySelecionado.id, {
          inicio: inicioIso,
          fim: fimIso,
        });

        if (!cancelado) {
          setEntregas(resposta.entregas);
          setResumo(resposta.resumo);
          setCarregando(false);
        }
      } catch {
        if (!cancelado) {
          if (motoboySelecionado.id === 1) {
            setEntregas(EXTRATO_DEMO_CARLOS.entregas);
            setResumo(EXTRATO_DEMO_CARLOS.resumo);
          } else {
            setEntregas([]);
            recalcularResumo([]);
          }
          setCarregando(false);
        }
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [motoboySelecionado.id, dataInicio, dataFim]);

  // Aplicação dos atalhos de período
  const selecionarAtalhoPeriodo = (atalho: AtalhoPeriodo) => {
    setAtalhoPeriodo(atalho);
    if (atalho === 'hoje') {
      setDataInicio('05/11/2026');
      setDataFim('05/11/2026');
    } else if (atalho === '7dias') {
      setDataInicio('30/10/2026');
      setDataFim('05/11/2026');
    } else if (atalho === 'mes') {
      setDataInicio('01/11/2026');
      setDataFim('30/11/2026');
    }
  };

  // Alterna o status de pagamento individual
  const alternarPagamentoEntrega = async (
    entregaId: number,
    statusAtual: StatusPagamentoEntrega,
  ) => {
    const novoStatus: StatusPagamentoEntrega =
      statusAtual === 'pendente' ? 'pago' : 'pendente';
    try {
      await atualizarPagamentoEntrega(entregaId, novoStatus);
    } catch {
      // Permite testar visualmente mesmo se a API estiver offline
    }

    const listaAtualizada = entregas.map((item) =>
      item.id === entregaId
        ? {
            ...item,
            statusPagamento: novoStatus,
            pagoEm: novoStatus === 'pago' ? new Date().toISOString() : null,
          }
        : item,
    );

    setEntregas(listaAtualizada);
    recalcularResumo(listaAtualizada);
    setMensagemSucesso(
      novoStatus === 'pago'
        ? `Entrega #${entregaId} marcada como paga.`
        : `Entrega #${entregaId} reaberta como pendente.`,
    );
  };

  // Quitar em lote todas as entregas pendentes
  const handleQuitarPendentes = async () => {
    const pendentes = entregas.filter((e) => e.statusPagamento === 'pendente');
    if (pendentes.length === 0) {
      setMensagemSucesso('Não há entregas pendentes para quitar no período.');
      return;
    }

    try {
      await quitarEntregasMotoboy(motoboySelecionado.id, {
        inicio: '2026-11-01',
        fim: '2026-11-05',
      });
    } catch {
      // Fallback para testes sem backend conectado
    }

    const valorTotalQuitado = pendentes.reduce((acc, cur) => acc + cur.valorMotoboy, 0);
    const listaAtualizada = entregas.map((item) => ({
      ...item,
      statusPagamento: 'pago' as StatusPagamentoEntrega,
      pagoEm: item.pagoEm ?? new Date().toISOString(),
    }));

    setEntregas(listaAtualizada);
    recalcularResumo(listaAtualizada);
    setMensagemSucesso(
      `${pendentes.length} ${pendentes.length === 1 ? 'entrega pendente quitada' : 'entregas pendentes quitadas'} com sucesso (${formatarMoeda(valorTotalQuitado)})!`,
    );
  };

  // Filtragem da lista para exibição
  const entregasFiltradas = useMemo(() => {
    if (filtroStatus === 'todas') return entregas;
    return entregas.filter((e) => e.statusPagamento === filtroStatus);
  }, [entregas, filtroStatus]);

  const emColunas = larguraConteudo >= 960;
  const tabelaWeb = larguraConteudo >= 800;

  return (
    <Pagina
      titulo="Controle de ganhos"
      subtitulo="Acompanhe seus ganhos e os pagamentos das suas entregas.">
      {/* Alerta de feedback de ações */}
      {mensagemSucesso && (
        <Aviso
          icone="info"
          titulo="Pagamentos atualizados"
          texto={mensagemSucesso}
        />
      )}

      {/* Cartão de Filtros de Entregador e Período */}
      <Cartao style={styles.cartaoFiltros}>
        <View style={[styles.linhaFiltrosTopo, !emColunas && styles.linhaFiltrosColuna]}>
          {/* Seletor de Entregador */}
          <View style={styles.grupoEntregador}>
            <Texto peso={600} cor="textoSecundario" tamanho={13}>
              Entregador
            </Texto>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Selecionar entregador"
              onPress={() => setModalMotoboyAberto(true)}
              style={[
                styles.seletorMotoboy,
                { borderColor: cores.borda, backgroundColor: cores.superficie },
              ]}>
              <Texto peso={500} tamanho={15} cor="textoPrincipal">
                {motoboySelecionado.nome}
              </Texto>
              <Icone nome="seta" tamanho={18} cor={cores.textoSecundario} />
            </Pressable>
          </View>

          {/* Indicador do período selecionado */}
          <View style={styles.grupoPeriodoTexto}>
            <Texto peso={500} cor="textoSecundario" tamanho={13}>
              Período selecionado
            </Texto>
            <Texto peso={600} tamanho={16} cor="textoPrincipal">
              01 a 05 de novembro de 2026
            </Texto>
          </View>
        </View>

        <Divisor />

        {/* Linha de Atalhos e Inputs de Data */}
        <View
          style={[styles.linhaBotoesPeriodo, !emColunas && styles.linhaBotoesColuna]}>
          <View style={styles.grupoAtalhos}>
            <Texto peso={600} cor="textoSecundario" tamanho={13} style={styles.rotuloCampo}>
              Período
            </Texto>
            <View style={styles.chipsAtalhos}>
              <Chip
                rotulo="Hoje"
                ativo={atalhoPeriodo === 'hoje'}
                onPress={() => selecionarAtalhoPeriodo('hoje')}
              />
              <Chip
                rotulo="Últimos 7 dias"
                ativo={atalhoPeriodo === '7dias'}
                onPress={() => selecionarAtalhoPeriodo('7dias')}
              />
              <Chip
                rotulo="Este mês"
                ativo={atalhoPeriodo === 'mes'}
                onPress={() => selecionarAtalhoPeriodo('mes')}
              />
              <Chip
                rotulo="Personalizado"
                ativo={atalhoPeriodo === 'personalizado'}
                onPress={() => selecionarAtalhoPeriodo('personalizado')}
              />
            </View>
          </View>

          {/* Inputs de Data */}
          <View style={styles.grupoDatas}>
            <View style={styles.campoData}>
              <Texto peso={600} cor="textoSecundario" tamanho={13}>
                Data inicial
              </Texto>
              <View
                style={[
                  styles.inputComIcone,
                  { borderColor: cores.borda, backgroundColor: cores.superficie },
                ]}>
                <TextInput
                  value={dataInicio}
                  onChangeText={(txt) => {
                    setDataInicio(txt);
                    setAtalhoPeriodo('personalizado');
                  }}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={cores.textoSecundario}
                  style={[styles.inputTextoData, { color: cores.textoPrincipal }]}
                />
                <Icone nome="calendario" tamanho={18} cor={cores.textoSecundario} />
              </View>
            </View>

            <View style={styles.campoData}>
              <Texto peso={600} cor="textoSecundario" tamanho={13}>
                Data final
              </Texto>
              <View
                style={[
                  styles.inputComIcone,
                  { borderColor: cores.borda, backgroundColor: cores.superficie },
                ]}>
                <TextInput
                  value={dataFim}
                  onChangeText={(txt) => {
                    setDataFim(txt);
                    setAtalhoPeriodo('personalizado');
                  }}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={cores.textoSecundario}
                  style={[styles.inputTextoData, { color: cores.textoPrincipal }]}
                />
                <Icone nome="calendario" tamanho={18} cor={cores.textoSecundario} />
              </View>
            </View>
          </View>
        </View>
      </Cartao>

      {/* Cards de Resumo de Ganhos */}
      <Grade colunas={emColunas ? 4 : 2}>
        {/* A receber */}
        <Cartao style={styles.cartaoMetrica}>
          <Texto cor="textoSecundario" tamanho={13} peso={500}>
            A receber
          </Texto>
          <Texto tamanho={28} peso={700}>
            {formatarMoeda(resumo.valorPendenteAReceber)}
          </Texto>
          <Texto tamanho={13} cor="textoSecundario">
            {resumo.entregasPendentes}{' '}
            {resumo.entregasPendentes === 1 ? 'entrega pendente' : 'entregas pendentes'}
          </Texto>
          <View style={styles.etiquetaMetrica}>
            <Etiqueta rotulo="Pendente" corPonto={cores.statusPreparando} />
          </View>
        </Cartao>

        {/* Já recebido */}
        <Cartao style={styles.cartaoMetrica}>
          <Texto cor="textoSecundario" tamanho={13} peso={500}>
            Já recebido
          </Texto>
          <Texto tamanho={28} peso={700}>
            {formatarMoeda(resumo.valorJaPago)}
          </Texto>
          <Texto tamanho={13} cor="textoSecundario">
            {resumo.entregasPagas}{' '}
            {resumo.entregasPagas === 1 ? 'entrega paga' : 'entregas pagas'}
          </Texto>
          <View style={styles.etiquetaMetrica}>
            <Etiqueta rotulo="Pago" corPonto={cores.statusEntregue} />
          </View>
        </Cartao>

        {/* Total no período */}
        <Cartao style={styles.cartaoMetrica}>
          <Texto cor="textoSecundario" tamanho={13} peso={500}>
            Total no período
          </Texto>
          <Texto tamanho={28} peso={700}>
            {formatarMoeda(resumo.valorTotalPeriodo)}
          </Texto>
          <Texto tamanho={13} cor="textoSecundario">
            {resumo.totalEntregas} entregas ({formatarKm(resumo.distanciaTotalKm)} km)
          </Texto>
          <Texto tamanho={13} cor="textoSecundario">
            No período selecionado
          </Texto>
        </Cartao>

        {/* Média por entrega */}
        <Cartao style={styles.cartaoMetrica}>
          <Texto cor="textoSecundario" tamanho={13} peso={500}>
            Média por entrega
          </Texto>
          <Texto tamanho={28} peso={700}>
            {formatarMoeda(resumo.mediaPorEntrega)}
          </Texto>
          <Texto tamanho={13} cor="textoSecundario">
            Valor médio no período
          </Texto>
          <Texto tamanho={13} cor="textoSecundario">
            No período selecionado
          </Texto>
        </Cartao>
      </Grade>

      {/* Extrato de Entregas */}
      <Cartao style={styles.cartaoExtrato}>
        <View style={[styles.linhaTituloExtrato, !tabelaWeb && styles.colunaTituloExtrato]}>
          <View style={styles.titulosExtrato}>
            <Texto accessibilityRole="header" tamanho={20} peso={700}>
              Extrato de entregas
            </Texto>
            <Texto tamanho={14} cor="textoSecundario">
              {resumo.totalEntregas} entregas • 01 a 05 nov. 2026
            </Texto>
          </View>

          <Botao
            rotulo="Quitar pendentes do período"
            variante="primario"
            onPress={handleQuitarPendentes}
          />
        </View>

        {/* Filtros em abas: Todas, Pendentes, Pagas */}
        <View style={styles.filtrosAbas}>
          <Chip
            rotulo="Todas"
            ativo={filtroStatus === 'todas'}
            onPress={() => setFiltroStatus('todas')}
          />
          <Chip
            rotulo="Pendentes"
            ativo={filtroStatus === 'pendente'}
            onPress={() => setFiltroStatus('pendente')}
          />
          <Chip
            rotulo="Pagas"
            ativo={filtroStatus === 'pago'}
            onPress={() => setFiltroStatus('pago')}
          />
        </View>

        {/* Estado vazio */}
        {entregasFiltradas.length === 0 ? (
          <View style={styles.linhaVazia}>
            <Texto cor="textoSecundario">
              {carregando
                ? 'Carregando entregas...'
                : 'Nenhuma entrega encontrada para o filtro selecionado.'}
            </Texto>
          </View>
        ) : tabelaWeb ? (
          /* Visualização Web: Tabela completa com colunas */
          <View style={styles.tabelaContainer}>
            {/* Cabeçalho da tabela */}
            <View style={[styles.linhaCabecalho, { backgroundColor: cores.fundo }]}>
              <Texto peso={600} style={styles.colunaPedido} cor="textoSecundario">
                Pedido
              </Texto>
              <Texto peso={600} style={styles.colunaDataHora} cor="textoSecundario">
                Data e hora
              </Texto>
              <Texto peso={600} style={styles.colunaCliente} cor="textoSecundario">
                Cliente e destino
              </Texto>
              <Texto peso={600} style={styles.colunaDistancia} cor="textoSecundario">
                Distância
              </Texto>
              <Texto peso={600} style={styles.colunaValor} cor="textoSecundario">
                Seu valor
              </Texto>
              <Texto peso={600} style={styles.colunaStatus} cor="textoSecundario">
                Status
              </Texto>
              <Texto peso={600} style={styles.colunaAcao} cor="textoSecundario">
                Ação
              </Texto>
            </View>

            {/* Linhas da tabela */}
            {entregasFiltradas.map((item) => {
              const estaPago = item.statusPagamento === 'pago';
              return (
                <View key={item.id}>
                  <View style={styles.linhaItem}>
                    {/* Pedido */}
                    <View style={styles.colunaPedido}>
                      <Texto peso={600} tamanho={15}>
                        #{String(item.pedidoId).padStart(3, '0')}
                      </Texto>
                    </View>

                    {/* Data e hora */}
                    <View style={styles.colunaDataHora}>
                      <Texto peso={500} tamanho={14}>
                        {formatarDataBr(item.dataHora)}
                      </Texto>
                      <Texto tamanho={13} cor="textoSecundario">
                        {formatarHoraBr(item.dataHora)}
                      </Texto>
                    </View>

                    {/* Cliente e endereço */}
                    <View style={styles.colunaCliente}>
                      <Texto peso={600} tamanho={14}>
                        {item.pedido.nomeCliente ?? 'Cliente não identificado'}
                      </Texto>
                      <Texto tamanho={13} cor="textoSecundario">
                        {item.pedido.enderecoDestino}
                      </Texto>
                    </View>

                    {/* Distância */}
                    <View style={styles.colunaDistancia}>
                      <Texto tamanho={14} peso={500}>
                        {formatarKm(item.distanciaKm)} km
                      </Texto>
                    </View>

                    {/* Seu valor */}
                    <View style={styles.colunaValor}>
                      <Texto peso={700} tamanho={15}>
                        {formatarMoeda(item.valorMotoboy)}
                      </Texto>
                    </View>

                    {/* Status */}
                    <View style={styles.colunaStatus}>
                      <Etiqueta
                        rotulo={estaPago ? 'Pago' : 'Pendente'}
                        corPonto={estaPago ? cores.statusEntregue : cores.statusPreparando}
                      />
                    </View>

                    {/* Ação */}
                    <View style={styles.colunaAcao}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          estaPago
                            ? `Reabrir pagamento da entrega #${item.id}`
                            : `Marcar entrega #${item.id} como paga`
                        }
                        onPress={() =>
                          alternarPagamentoEntrega(item.id, item.statusPagamento)
                        }
                        style={[
                          styles.botaoAcaoTabela,
                          {
                            borderColor: cores.borda,
                            backgroundColor: cores.superficie,
                          },
                        ]}>
                        <Texto peso={600} tamanho={13} cor="textoPrincipal">
                          {estaPago ? 'Reabrir' : 'Marcar como Pago'}
                        </Texto>
                      </Pressable>
                    </View>
                  </View>
                  <Divisor />
                </View>
              );
            })}

            {/* Rodapé da tabela */}
            <View style={styles.rodapeTabela}>
              <Texto tamanho={13} cor="textoSecundario">
                {resumo.totalEntregas} entregas • {formatarKm(resumo.distanciaTotalKm)} km
                percorridos
              </Texto>
              <Texto peso={600} tamanho={15} cor="textoPrincipal">
                Total no período: {formatarMoeda(resumo.valorTotalPeriodo)}
              </Texto>
            </View>
          </View>
        ) : (
          /* Visualização Mobile: Cards individuais por entrega */
          <View style={styles.listaCardsMobile}>
            {entregasFiltradas.map((item) => {
              const estaPago = item.statusPagamento === 'pago';
              return (
                <Cartao key={item.id} style={styles.cardEntregaMobile}>
                  <View style={styles.linhaTopoCardMobile}>
                    <Texto peso={700} tamanho={16}>
                      #{String(item.pedidoId).padStart(3, '0')}
                    </Texto>
                    <Etiqueta
                      rotulo={estaPago ? 'Pago' : 'Pendente'}
                      corPonto={estaPago ? cores.statusEntregue : cores.statusPreparando}
                    />
                  </View>

                  <Texto tamanho={13} cor="textoSecundario">
                    {formatarDataBr(item.dataHora)} • {formatarHoraBr(item.dataHora)}
                  </Texto>

                  <View style={styles.blocoClienteMobile}>
                    <Texto peso={600} tamanho={15}>
                      {item.pedido.nomeCliente ?? 'Cliente não identificado'}
                    </Texto>
                    <Texto tamanho={13} cor="textoSecundario">
                      {item.pedido.enderecoDestino}
                    </Texto>
                  </View>

                  <View style={styles.linhaMetricasCardMobile}>
                    <View>
                      <Texto tamanho={12} cor="textoSecundario">
                        Distância
                      </Texto>
                      <Texto peso={500} tamanho={14}>
                        {formatarKm(item.distanciaKm)} km
                      </Texto>
                    </View>

                    <View style={styles.valorDireitaMobile}>
                      <Texto tamanho={12} cor="textoSecundario">
                        Seu valor
                      </Texto>
                      <Texto peso={700} tamanho={16}>
                        {formatarMoeda(item.valorMotoboy)}
                      </Texto>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      estaPago
                        ? `Reabrir pagamento da entrega #${item.id}`
                        : `Marcar entrega #${item.id} como paga`
                    }
                    onPress={() =>
                      alternarPagamentoEntrega(item.id, item.statusPagamento)
                    }
                    style={[
                      styles.botaoAcaoMobile,
                      {
                        borderColor: cores.borda,
                        backgroundColor: cores.superficie,
                      },
                    ]}>
                    <Texto peso={600} tamanho={14} cor="textoPrincipal">
                      {estaPago ? 'Reabrir' : 'Marcar como Pago'}
                    </Texto>
                  </Pressable>
                </Cartao>
              );
            })}
          </View>
        )}

        {/* Textos de rodapé informativo */}
        <View style={styles.notasRodape}>
          <Texto tamanho={13} cor="textoSecundario">
            Os valores correspondem ao seu repasse por entrega.
          </Texto>
          <Texto tamanho={13} cor="textoSecundario">
            Exemplo de demonstrativo • valores em reais (R$).
          </Texto>
        </View>
      </Cartao>

      {/* Modal de seleção do Motoboy */}
      <Modal
        visible={modalMotoboyAberto}
        transparent
        animationType="fade"
        onRequestClose={() => setModalMotoboyAberto(false)}>
        <Pressable
          style={styles.modalFundo}
          onPress={() => setModalMotoboyAberto(false)}>
          <View
            style={[
              styles.modalConteudo,
              { backgroundColor: cores.superficie, borderColor: cores.borda },
            ]}>
            <View style={styles.modalTituloLinha}>
              <Texto tamanho={18} peso={600}>
                Selecionar Entregador
              </Texto>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                onPress={() => setModalMotoboyAberto(false)}>
                <Icone nome="fechar" tamanho={20} />
              </Pressable>
            </View>

            <Divisor />

            {listaMotoboys.map((m) => {
              const selecionado = m.id === motoboySelecionado.id;
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Selecionar ${m.nome}`}
                  onPress={() => {
                    setMotoboySelecionado(m);
                    setModalMotoboyAberto(false);
                  }}
                  style={[
                    styles.itemOpcaoMotoboy,
                    selecionado && { backgroundColor: cores.fundo },
                  ]}>
                  <View style={styles.opcaoMotoboyInfo}>
                    <Texto peso={selecionado ? 600 : 500} tamanho={15}>
                      {m.nome}
                    </Texto>
                    <Texto tamanho={13} cor="textoSecundario">
                      {m.telefone} • {m.placa ? `Moto ${m.placa}` : `CPF: ${m.cpf}`}
                    </Texto>
                  </View>
                  {selecionado && <Icone nome="check" tamanho={20} cor={cores.brand} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </Pagina>
  );
}

const styles = StyleSheet.create({
  cartaoFiltros: {
    padding: Espacamento.large,
    gap: Espacamento.large,
  },
  linhaFiltrosTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.large,
  },
  linhaFiltrosColuna: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  grupoEntregador: {
    gap: Espacamento.xsmall,
    minWidth: 260,
  },
  seletorMotoboy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: Espacamento.medium,
    borderRadius: Raio.small,
    borderWidth: 1,
  },
  grupoPeriodoTexto: {
    gap: Espacamento.xsmall,
  },
  linhaBotoesPeriodo: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Espacamento.large,
  },
  linhaBotoesColuna: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  grupoAtalhos: {
    gap: Espacamento.small,
    flexShrink: 1,
  },
  rotuloCampo: {
    marginBottom: 2,
  },
  chipsAtalhos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Espacamento.small,
  },
  grupoDatas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.medium,
  },
  campoData: {
    gap: Espacamento.xsmall,
  },
  inputComIcone: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderWidth: 1,
    borderRadius: Raio.small,
    paddingHorizontal: Espacamento.medium,
    gap: Espacamento.small,
    minWidth: 140,
  },
  inputTextoData: {
    fontSize: 14,
    paddingVertical: 0,
    minWidth: 90,
  },
  cartaoMetrica: {
    padding: Espacamento.large,
    gap: Espacamento.xsmall,
    justifyContent: 'space-between',
    minHeight: 140,
  },
  etiquetaMetrica: {
    alignSelf: 'flex-start',
    marginTop: Espacamento.xsmall,
  },
  cartaoExtrato: {
    padding: Espacamento.large,
    gap: Espacamento.large,
  },
  linhaTituloExtrato: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
  },
  colunaTituloExtrato: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  titulosExtrato: {
    gap: 4,
  },
  filtrosAbas: {
    flexDirection: 'row',
    gap: Espacamento.small,
  },
  linhaVazia: {
    padding: Espacamento.xlarge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabelaContainer: {
    gap: Espacamento.small,
  },
  linhaCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Espacamento.medium,
    paddingHorizontal: Espacamento.medium,
    borderRadius: Raio.small,
  },
  linhaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Espacamento.medium,
    paddingHorizontal: Espacamento.medium,
  },
  colunaPedido: {
    width: 80,
  },
  colunaDataHora: {
    width: 120,
    gap: 2,
  },
  colunaCliente: {
    flex: 1,
    gap: 2,
    paddingRight: Espacamento.small,
  },
  colunaDistancia: {
    width: 100,
  },
  colunaValor: {
    width: 110,
  },
  colunaStatus: {
    width: 130,
  },
  colunaAcao: {
    width: 160,
    alignItems: 'flex-end',
  },
  botaoAcaoTabela: {
    paddingHorizontal: Espacamento.medium,
    paddingVertical: Espacamento.xsmall + 3,
    borderRadius: Raio.small,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rodapeTabela: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Espacamento.medium,
    paddingHorizontal: Espacamento.medium,
  },
  listaCardsMobile: {
    gap: Espacamento.medium,
  },
  cardEntregaMobile: {
    padding: Espacamento.large,
    gap: Espacamento.medium,
  },
  linhaTopoCardMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  blocoClienteMobile: {
    gap: 2,
  },
  linhaMetricasCardMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Espacamento.xsmall,
  },
  valorDireitaMobile: {
    alignItems: 'flex-end',
  },
  botaoAcaoMobile: {
    height: 40,
    borderRadius: Raio.small,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Espacamento.xsmall,
  },
  notasRodape: {
    paddingTop: Espacamento.small,
    gap: 4,
  },
  modalFundo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Espacamento.large,
  },
  modalConteudo: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Raio.medium,
    borderWidth: 1,
    padding: Espacamento.large,
    gap: Espacamento.medium,
  },
  modalTituloLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemOpcaoMotoboy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Espacamento.medium,
    borderRadius: Raio.small,
  },
  opcaoMotoboyInfo: {
    gap: 2,
  },
});
