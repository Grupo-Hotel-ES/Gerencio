import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { OrderCard } from '@/components/dashboard/order-card';
import { FormularioPedido } from '@/components/dashboard/novo-pedido';
import { SeletorRestaurante } from '@/components/dashboard/formularios';
import { CartaoResumo, Grade, Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import { Botao, Cartao, Chip, Icone, Texto } from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import {
  formatarHora,
  formatarReais,
  STATUS,
  type Pedido,
  type StatusAtivo,
  type StatusPedido,
} from '@/data/pedidos';
import { useCores } from '@/hooks/use-cores';
import { atualizarStatus, listarPedidosAtivos } from '@/services/api-pedidos';
import { listarRestaurantes, type Restaurante } from '@/services/api-produtos';

type Filtro = 'todos' | StatusAtivo;

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'novo', rotulo: 'Novos' },
  { id: 'em_preparo', rotulo: 'Preparando' },
  { id: 'pronto', rotulo: 'Prontos' },
  { id: 'saiu_para_entrega', rotulo: 'Em entrega' },
];

const TODOS_OS_CANAIS = 'Todos os canais';
const INTERVALO_ATUALIZACAO_MS = 10_000;

export default function DashboardDePedidos() {
  const cores = useCores();
  const larguraConteudo = useLarguraConteudo();
  // `null` enquanto a primeira carga não termina.
  const [ativos, setAtivos] = useState<Pedido[] | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [canal, setCanal] = useState<string | null>(null);
  const [menuCanais, setMenuCanais] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [busca, setBusca] = useState('');
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([]);
  const [erroRestaurantes, setErroRestaurantes] = useState<string | null>(null);
  const [restauranteId, setRestauranteId] = useState<number>();
  const [novoPedido, setNovoPedido] = useState(false);
  const [ocupados, setOcupados] = useState<number[]>([]);
  const operacoes = useRef(new Set<number>());
  const consulta = useRef(0);

  useEffect(() => {
    let ativo = true;
    const atualizar = () => listarRestaurantes().then((dados) => {
      if (ativo) { setRestaurantes(dados); setErroRestaurantes(null); }
    }).catch((e: Error) => { if (ativo) setErroRestaurantes(e.message); });
    atualizar();
    const intervalo = setInterval(atualizar, INTERVALO_ATUALIZACAO_MS);
    return () => { ativo = false; clearInterval(intervalo); };
  }, []);

  const carregar = useCallback(async () => {
    const versao = ++consulta.current;
    try {
      const dados = await listarPedidosAtivos(restauranteId);
      if (versao !== consulta.current) return;
      setAtivos(dados);
      setAtualizadoEm(new Date());
      setErro(null);
    } catch (e) {
      if (versao === consulta.current) setErro((e as Error).message);
    }
  }, [restauranteId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carregar atualiza o estado somente após a resposta HTTP.
    carregar();
    const intervalo = setInterval(carregar, INTERVALO_ATUALIZACAO_MS);
    return () => { clearInterval(intervalo); consulta.current += 1; };
  }, [carregar]);

  const fila = ativos ?? [];
  const canais = [...new Set(fila.map((p) => p.canal))].sort();
  const contar = (status: StatusAtivo) => fila.filter((p) => p.status === status).length;
  const totalAtivo = fila.reduce((soma, p) => soma + p.total, 0);

  const termo = busca.trim().toLowerCase();
  const visiveis = fila.filter(
    (p) =>
      (filtro === 'todos' || p.status === filtro) &&
      (!canal || p.canal === canal) &&
      (!termo || p.cliente.toLowerCase().includes(termo) || String(p.numero).includes(termo)),
  );

  const alterar = async (pedido: Pedido, status: StatusPedido) => {
    if (operacoes.current.has(pedido.numero)) return;
    operacoes.current.add(pedido.numero); setOcupados([...operacoes.current]);
    try {
      await atualizarStatus(pedido.numero, status);
      await carregar();
    } catch (e) {
      setErro(`Pedido #${pedido.numero}: ${(e as Error).message}`);
    } finally {
      operacoes.current.delete(pedido.numero); setOcupados([...operacoes.current]);
    }
  };

  const colunasPedidos = larguraConteudo >= 1000 ? 3 : larguraConteudo >= 640 ? 2 : 1;
  const colunasResumo = larguraConteudo >= 1000 ? 5 : larguraConteudo >= 640 ? 2 : 1;

  const resumo = [
    {
      rotulo: 'Em andamento',
      valor: `${fila.length} ${fila.length === 1 ? 'pedido' : 'pedidos'}`,
      detalhe: `${formatarReais(totalAtivo)} em pedidos ativos`,
    },
    { rotulo: 'Novos', valor: contar('novo'), detalhe: 'Aguardando aceite' },
    { rotulo: 'Preparando', valor: contar('em_preparo'), detalhe: 'Em produção na cozinha' },
    { rotulo: 'Prontos', valor: contar('pronto'), detalhe: 'Aguardando saída ou retirada' },
    { rotulo: 'Em entrega', valor: contar('saiu_para_entrega'), detalhe: 'Aguardando confirmação de entrega' },
  ];

  const controle = [styles.controle, { borderColor: cores.borda, backgroundColor: cores.superficie }];

  return (
    <Pagina
      titulo="Dashboard de pedidos"
      subtitulo="Acompanhe a cozinha e as entregas, sem trocar de aplicativo."
      acao={<Botao rotulo="Novo pedido" icone="mais" variante="primario" disabled={restaurantes.length === 0} onPress={() => setNovoPedido(true)} />}>
      <SeletorRestaurante restaurantes={restaurantes} valor={restauranteId} onChange={(id) => {
        consulta.current += 1; setAtivos(null); setAtualizadoEm(null); setRestauranteId(id);
      }} todos desabilitado={ocupados.length > 0} />
      {erroRestaurantes && <Texto cor="feedbackErro" accessibilityRole="alert">Restaurantes: {erroRestaurantes}</Texto>}
      {restaurantes.length === 0 && <Texto cor="textoSecundario">Para cadastrar pedidos, é necessário ter um restaurante cadastrado e a API de restaurantes disponível.</Texto>}
      {novoPedido && <FormularioPedido restaurantes={restaurantes} restauranteInicial={restauranteId}
        onFechar={() => setNovoPedido(false)} onConcluir={(id) => {
          setNovoPedido(false); setFiltro('todos'); setCanal(null); setBusca('');
          if (restauranteId !== undefined && restauranteId !== id) {
            consulta.current += 1; setAtivos(null); setAtualizadoEm(null); setRestauranteId(id);
          } else carregar();
        }} />}
      <Grade colunas={colunasResumo}>
        {resumo.map((item) => (
          <CartaoResumo key={item.rotulo} {...item} />
        ))}
      </Grade>

      <View style={styles.filaCabecalho}>
        <Texto accessibilityRole="header" tamanho={18} peso={500}>
          Fila de pedidos
        </Texto>
        <Texto tamanho={13} cor="textoSecundario">
          {atualizadoEm ? `Atualizado às ${formatarHora(atualizadoEm)}` : 'Carregando…'}
        </Texto>
        <Botao rotulo="Atualizar" icone="sincronizar" onPress={carregar} />
      </View>

      <View style={styles.barra}>
        <View style={styles.filtros}>
          {FILTROS.map(({ id, rotulo }) => (
            <Chip
              key={id}
              rotulo={`${rotulo} · ${id === 'todos' ? fila.length : contar(id)}`}
              ativo={filtro === id}
              onPress={() => setFiltro(id)}
            />
          ))}
        </View>

        <View style={styles.controles}>
          <View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: menuCanais }}
              onPress={() => setMenuCanais((aberto) => !aberto)}
              style={controle}>
              <Icone nome="seta" />
              <Texto peso={500}>{canal ?? TODOS_OS_CANAIS}</Texto>
            </Pressable>
            {menuCanais && (
              <View
                style={[
                  styles.menu,
                  { borderColor: cores.borda, backgroundColor: cores.superficie },
                ]}>
                {[null, ...canais].map((opcao) => (
                  <Pressable
                    key={opcao ?? TODOS_OS_CANAIS}
                    accessibilityRole="button"
                    onPress={() => {
                      setCanal(opcao);
                      setMenuCanais(false);
                    }}
                    style={[styles.opcao, opcao === canal && { backgroundColor: cores.fundo2 }]}>
                    <Texto peso={500}>{opcao ?? TODOS_OS_CANAIS}</Texto>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {buscando ? (
            <View style={controle}>
              <Icone nome="busca" />
              <TextInput
                autoFocus
                value={busca}
                onChangeText={setBusca}
                onBlur={() => !busca && setBuscando(false)}
                placeholder="Cliente ou nº do pedido"
                placeholderTextColor={cores.textoSecundario}
                accessibilityLabel="Buscar pedido"
                style={[styles.campoBusca, { color: cores.textoPrincipal }]}
              />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setBuscando(true)}
              style={controle}>
              <Icone nome="busca" />
              <Texto peso={500}>Buscar pedido</Texto>
            </Pressable>
          )}
        </View>
      </View>

      {erro && (
        <Cartao style={{ borderColor: cores.feedbackErro }}>
          <Texto accessibilityRole="alert">{erro}</Texto>
        </Cartao>
      )}

      {visiveis.length > 0 ? (
        <Grade colunas={colunasPedidos}>
          {visiveis.map((pedido) => (
            <OrderCard
              key={pedido.numero}
              pedido={pedido}
              onAvancar={() => alterar(pedido, STATUS[pedido.status].proximo)}
              onCancelar={() => alterar(pedido, 'cancelado')}
              ocupado={ocupados.includes(pedido.numero)}
            />
          ))}
        </Grade>
      ) : (
        <Cartao style={styles.vazio}>
          <Texto cor="textoSecundario">
            {ativos === null && !erro ? 'Carregando pedidos…' : 'Nenhum pedido encontrado.'}
          </Texto>
        </Cartao>
      )}
    </Pagina>
  );
}

const styles = StyleSheet.create({
  filaCabecalho: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.small,
    marginTop: Espacamento.small,
  },
  barra: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
    // Mantém o menu de canais acima dos cartões.
    zIndex: 1,
  },
  filtros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Espacamento.small,
  },
  controles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Espacamento.large,
  },
  controle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
    height: 44,
    paddingHorizontal: Espacamento.medium,
    borderWidth: 1,
    borderRadius: Raio.small,
  },
  menu: {
    position: 'absolute',
    top: 48,
    left: 0,
    minWidth: '100%',
    padding: Espacamento.xsmall,
    borderWidth: 1,
    borderRadius: Raio.small,
  },
  opcao: {
    paddingVertical: Espacamento.small,
    paddingHorizontal: Espacamento.small,
    borderRadius: Raio.small / 2,
  },
  campoBusca: {
    width: 180,
    fontFamily: Fonts?.sans,
    fontSize: 14,
    outlineWidth: 0,
  },
  vazio: {
    alignItems: 'center',
    paddingVertical: Espacamento.xlarge,
  },
});
