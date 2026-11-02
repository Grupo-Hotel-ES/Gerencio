import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { CartaoResumo, Grade, Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import { Botao, Cartao, Chip, Divisor, Etiqueta, Texto } from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import { formatarReais } from '@/data/pedidos';
import { useCores } from '@/hooks/use-cores';
import { buscarRelatorioVendas, type RelatorioVendas } from '@/services/api-relatorios';

type PeriodoId = 'hoje' | '7dias' | 'mes' | 'personalizado';
type Intervalo = { inicio: Date; fim: Date };

const PERIODOS: { id: PeriodoId; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7dias', rotulo: 'Últimos 7 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'personalizado', rotulo: 'Personalizado' },
];

const ALTURA_MAXIMA_BARRA = 140;
// Acima disso os valores sobre as barras se sobrepõem.
const MAX_BARRAS_COM_VALOR = 10;
const MAX_ROTULOS_DE_DIA = 8;

function intervaloDoPeriodo(periodo: Exclude<PeriodoId, 'personalizado'>, hoje: Date): Intervalo {
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (periodo === '7dias') inicio.setDate(inicio.getDate() - 6);
  if (periodo === 'mes') inicio.setDate(1);
  return { inicio, fim: hoje };
}

/** Lê uma data digitada como DD/MM/AAAA; devolve null se estiver incompleta ou não existir. */
function lerData(texto: string): Date | null {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!partes) return null;
  const [dia, mes, ano] = partes.slice(1).map(Number);
  const data = new Date(ano, mes - 1, dia);
  return data.getDate() === dia && data.getMonth() === mes - 1 ? data : null;
}

function dataCurta(data: Date) {
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace(' de ', ' ');
}

function descreverIntervalo({ inicio, fim }: Intervalo) {
  const ano = fim.getFullYear();
  if (inicio.getTime() === fim.getTime()) return `${dataCurta(fim)} ${ano}`;
  const mesmoMes = inicio.getMonth() === fim.getMonth() && inicio.getFullYear() === ano;
  const de = mesmoMes ? String(inicio.getDate()).padStart(2, '0') : dataCurta(inicio);
  return `${de}–${dataCurta(fim)} ${ano}`;
}

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function Relatorios() {
  const cores = useCores();
  const emColunas = useLarguraConteudo() >= 1000;
  const [periodo, setPeriodo] = useState<PeriodoId>('7dias');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  // Definido só no cliente, para não fixar a data da renderização estática.
  const [hoje, setHoje] = useState<Date | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioVendas | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    const agora = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A data local só é conhecida após a hidratação.
    setHoje(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()));
  }, []);

  let intervalo: Intervalo | null = null;
  if (periodo === 'personalizado') {
    const inicio = lerData(de);
    const fim = lerData(ate);
    if (inicio && fim && inicio <= fim) intervalo = { inicio, fim };
  } else if (hoje) {
    intervalo = intervaloDoPeriodo(periodo, hoje);
  }
  const inicioMs = intervalo?.inicio.getTime();
  const fimMs = intervalo?.fim.getTime();

  useEffect(() => {
    if (inicioMs === undefined || fimMs === undefined) return;
    let ativo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Limpa o resultado do período anterior enquanto busca outro.
    setRelatorio(null);
    setErro(false);
    buscarRelatorioVendas(new Date(inicioMs), new Date(fimMs))
      .then((dados) => ativo && setRelatorio(dados))
      .catch(() => ativo && setErro(true));
    // Ignora a resposta de um período que já foi trocado.
    return () => {
      ativo = false;
    };
  }, [inicioMs, fimMs]);

  const descricao = intervalo ? descreverIntervalo(intervalo) : 'Escolha as datas';
  const campo = [styles.campo, { borderColor: cores.borda, backgroundColor: cores.superficie }];

  let mensagem: string | null = null;
  if (erro) mensagem = 'Não foi possível carregar o relatório. Verifique se a api-pedidos está no ar.';
  else if (!intervalo && periodo === 'personalizado')
    mensagem = 'Informe as duas datas no formato DD/MM/AAAA, com o início antes do fim.';
  else if (!relatorio) mensagem = 'Carregando relatório…';
  else if (relatorio.pedidosConcluidos === 0) mensagem = 'Nenhum pedido concluído no período.';

  return (
    <Pagina
      titulo="Relatórios"
      subtitulo="Entenda suas vendas e prepare a operação dos próximos dias."
      acao={<Botao rotulo="Exportar relatório" icone="baixar" />}>
      <View style={styles.barra}>
        <View style={styles.periodos}>
          {PERIODOS.map(({ id, rotulo }) => (
            <Chip key={id} rotulo={rotulo} ativo={periodo === id} onPress={() => setPeriodo(id)} />
          ))}
        </View>
        {periodo === 'personalizado' ? (
          <View style={styles.periodos}>
            <TextInput
              value={de}
              onChangeText={setDe}
              placeholder="De: DD/MM/AAAA"
              placeholderTextColor={cores.textoSecundario}
              accessibilityLabel="Data inicial"
              maxLength={10}
              style={[campo, { color: cores.textoPrincipal }]}
            />
            <TextInput
              value={ate}
              onChangeText={setAte}
              placeholder="Até: DD/MM/AAAA"
              placeholderTextColor={cores.textoSecundario}
              accessibilityLabel="Data final"
              maxLength={10}
              style={[campo, { color: cores.textoPrincipal }]}
            />
          </View>
        ) : (
          <Botao
            rotulo={descricao}
            icone="calendario"
            onPress={() => setPeriodo('personalizado')}
          />
        )}
      </View>

      <Grade colunas={emColunas ? 3 : 1}>
        <CartaoResumo
          rotulo="Receita gerada"
          valor={relatorio ? formatarReais(relatorio.receitaTotal) : '—'}
          detalhe="Pedidos concluídos no período"
        />
        <CartaoResumo
          rotulo="Pedidos concluídos"
          valor={relatorio ? relatorio.pedidosConcluidos : '—'}
          detalhe="Cancelamentos não incluídos"
        />
        <CartaoResumo
          rotulo="Ticket médio"
          valor={relatorio ? formatarReais(relatorio.ticketMedio) : '—'}
          detalhe="Receita ÷ pedidos concluídos"
        />
      </Grade>

      {mensagem || !relatorio ? (
        <Cartao style={[styles.vazio, erro && { borderColor: cores.feedbackErro }]}>
          <Texto accessibilityRole={erro ? 'alert' : undefined} cor="textoSecundario">
            {mensagem}
          </Texto>
        </Cartao>
      ) : (
        <Detalhes relatorio={relatorio} descricao={descricao} emColunas={emColunas} />
      )}
    </Pagina>
  );
}

type DetalhesProps = { relatorio: RelatorioVendas; descricao: string; emColunas: boolean };

function Detalhes({ relatorio, descricao, emColunas }: DetalhesProps) {
  const cores = useCores();
  const { receitaPorDia, receitaPorCanal, itensMaisPedidos, receitaTotal } = relatorio;

  const melhorDia = receitaPorDia.reduce((melhor, dia) => (dia.receita > melhor.receita ? dia : melhor));
  const maiorVolume = itensMaisPedidos.at(0);
  const variosDias = receitaPorDia.length > 1;
  const comValores = receitaPorDia.length <= MAX_BARRAS_COM_VALOR;
  const passoRotulo = Math.ceil(receitaPorDia.length / MAX_ROTULOS_DE_DIA);

  const diaDaSemana = capitalizar(
    melhorDia.data.toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', ''),
  );
  const dataMelhorDia = melhorDia.data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  const participacao = ((melhorDia.receita / receitaTotal) * 100).toFixed(1).replace('.', ',');

  return (
    <View style={[styles.colunas, !emColunas && styles.empilhado]}>
      <View style={styles.coluna}>
        <Cartao style={styles.bloco}>
          <View style={styles.titulo}>
            <Texto accessibilityRole="header" tamanho={18} peso={500}>
              Receita por dia
            </Texto>
            <Texto tamanho={13} cor="textoSecundario">
              {descricao} • valores em reais
            </Texto>
          </View>

          <View style={[styles.grafico, !comValores && styles.graficoDenso]}>
            {receitaPorDia.map(({ data, receita }, indice) => {
              const dia = String(data.getDate()).padStart(2, '0');
              return (
                <View
                  key={data.getTime()}
                  accessible
                  accessibilityLabel={`${dataCurta(data)}: ${formatarReais(receita)}`}
                  style={styles.barraDia}>
                  {comValores && <Texto tamanho={13}>{Math.round(receita)}</Texto>}
                  <View
                    style={[
                      styles.barraValor,
                      receita > 0
                        ? {
                            height: Math.max(2, (receita / melhorDia.receita) * ALTURA_MAXIMA_BARRA),
                            backgroundColor: cores.brand,
                          }
                        : { height: 2, backgroundColor: cores.borda },
                    ]}
                  />
                  {/* Em períodos longos só parte dos dias é rotulada, para os números não colidirem. */}
                  <Texto tamanho={13} cor="textoSecundario" style={styles.rotuloDia}>
                    {indice % passoRotulo === 0 ? dia : ' '}
                  </Texto>
                </View>
              );
            })}
          </View>

          <Divisor />
          <View style={styles.linha}>
            <Texto tamanho={13} cor="textoSecundario">
              Total de {receitaPorDia.length} {variosDias ? 'dias' : 'dia'}
            </Texto>
            <Texto tamanho={16} peso={600}>
              {formatarReais(receitaTotal)}
            </Texto>
          </View>
        </Cartao>

        <Cartao style={styles.bloco}>
          <Texto accessibilityRole="header" tamanho={18} peso={500}>
            De onde vem a receita
          </Texto>
          {receitaPorCanal.map(({ canal, pedidos, receita }) => (
            <View key={canal} style={styles.linha}>
              <Texto peso={500}>
                {canal} • {pedidos} {pedidos === 1 ? 'pedido' : 'pedidos'}
              </Texto>
              <Texto tamanho={16} peso={600}>
                {formatarReais(receita)}
              </Texto>
            </View>
          ))}
          <View style={styles.linha}>
            <Texto peso={500}>Total no período</Texto>
            <Texto tamanho={16} peso={600}>
              {formatarReais(receitaTotal)}
            </Texto>
          </View>
          <Texto tamanho={13} cor="textoSecundario">
            Valor total dos pedidos concluídos, por canal de venda. Pedidos cancelados não entram
            no cálculo.
          </Texto>
        </Cartao>
      </View>

      <View style={styles.coluna}>
        <Cartao style={styles.bloco}>
          <View style={styles.titulo}>
            <Texto accessibilityRole="header" tamanho={18} peso={500}>
              Itens mais pedidos
            </Texto>
            <Texto tamanho={13} cor="textoSecundario">
              Ranking de produtos • unidades vendidas
            </Texto>
          </View>

          {itensMaisPedidos.map((item, indice) => (
            <View key={item.produtoId} style={styles.item}>
              <View style={styles.linha}>
                <View style={styles.itemNome}>
                  <View style={[styles.posicao, { backgroundColor: cores.fundo }]}>
                    <Texto peso={600}>{indice + 1}</Texto>
                  </View>
                  <View style={styles.titulo}>
                    <Texto tamanho={16} peso={500}>
                      {item.nome}
                    </Texto>
                    <Texto tamanho={13} cor="textoSecundario">
                      {formatarReais(item.receita)}
                    </Texto>
                  </View>
                </View>
                <Texto tamanho={16} peso={600}>
                  {item.unidades} un.
                </Texto>
              </View>
              <View style={[styles.trilha, { backgroundColor: cores.borda }]}>
                <View
                  style={[
                    styles.progresso,
                    {
                      width: `${(item.unidades / (maiorVolume?.unidades || 1)) * 100}%`,
                      backgroundColor: cores.brand,
                    },
                  ]}
                />
              </View>
            </View>
          ))}

          <Divisor />
          <Texto tamanho={13} cor="textoSecundario">
            O valor de cada item usa o preço atual do produto no cardápio.
          </Texto>
        </Cartao>

        <Cartao style={styles.bloco}>
          <View style={styles.selo}>
            <Etiqueta rotulo="Destaque do período" corPonto={cores.statusPronto} />
          </View>
          {variosDias && (
            <>
              <Texto accessibilityRole="header" tamanho={24} peso={600}>
                {diaDaSemana} foi o melhor dia
              </Texto>
              <Texto tamanho={16} cor="textoSecundario">
                {dataMelhorDia} gerou {formatarReais(melhorDia.receita)}: {participacao}% da receita
                do período.
              </Texto>
            </>
          )}
          {variosDias && maiorVolume && <Divisor />}
          {maiorVolume && (
            <>
              <Texto tamanho={16} peso={500}>
                {maiorVolume.nome} lidera em volume
              </Texto>
              <Texto tamanho={13} cor="textoSecundario">
                {maiorVolume.unidades === 1 ? 'Foi 1 unidade' : `Foram ${maiorVolume.unidades} unidades`}.
                Considere esse ritmo ao planejar o estoque dos próximos dias.
              </Texto>
            </>
          )}
        </Cartao>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
  },
  periodos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Espacamento.small,
  },
  campo: {
    width: 150,
    height: 44,
    paddingHorizontal: Espacamento.medium,
    borderWidth: 1,
    borderRadius: Raio.small,
    fontFamily: Fonts?.sans,
    fontSize: 14,
  },
  vazio: {
    alignItems: 'center',
    paddingVertical: Espacamento.xlarge,
  },
  colunas: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Espacamento.large,
  },
  empilhado: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  coluna: {
    flex: 1,
    gap: Espacamento.large,
  },
  bloco: {
    gap: Espacamento.large,
  },
  titulo: {
    flexShrink: 1,
    gap: Espacamento.xsmall,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
  },
  grafico: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Espacamento.small,
    paddingTop: Espacamento.xlarge,
  },
  graficoDenso: {
    gap: 2,
  },
  barraDia: {
    flex: 1,
    alignItems: 'center',
    gap: Espacamento.small,
  },
  barraValor: {
    alignSelf: 'stretch',
    borderTopLeftRadius: Raio.small / 2,
    borderTopRightRadius: Raio.small / 2,
  },
  rotuloDia: {
    marginTop: Espacamento.xsmall,
  },
  item: {
    gap: Espacamento.medium,
  },
  itemNome: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.medium,
  },
  posicao: {
    width: 28,
    height: 28,
    borderRadius: Raio.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trilha: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progresso: {
    height: 6,
    borderRadius: 3,
  },
  selo: {
    alignItems: 'flex-start',
  },
});
