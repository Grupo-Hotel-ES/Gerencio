import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { OrderCard } from '@/components/dashboard/order-card';
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
} from '@/data/pedidos';
import { useCores } from '@/hooks/use-cores';
import { atualizarStatus, listarPedidosAtivos } from '@/services/api-pedidos';

type Filtro = 'todos' | StatusAtivo;

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'novo', rotulo: 'Novos' },
  { id: 'em_preparo', rotulo: 'Preparando' },
  { id: 'pronto', rotulo: 'Prontos' },
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

  const carregar = useCallback(async () => {
    try {
      setAtivos(await listarPedidosAtivos());
      setAtualizadoEm(new Date());
      setErro(null);
    } catch {
      setErro('Não foi possível carregar os pedidos. Verifique se a api-pedidos está no ar.');
    }
  }, []);

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(intervalo);
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

  const avancar = async (pedido: Pedido) => {
    try {
      await atualizarStatus(pedido.numero, STATUS[pedido.status].proximo);
      await carregar();
    } catch {
      setErro(`Não foi possível atualizar o pedido #${pedido.numero}. Tente novamente.`);
    }
  };

  const colunasPedidos = larguraConteudo >= 1000 ? 3 : larguraConteudo >= 640 ? 2 : 1;
  const colunasResumo = larguraConteudo >= 1000 ? 4 : larguraConteudo >= 640 ? 2 : 1;

  const resumo = [
    {
      rotulo: 'Em andamento',
      valor: `${fila.length} ${fila.length === 1 ? 'pedido' : 'pedidos'}`,
      detalhe: `${formatarReais(totalAtivo)} em pedidos ativos`,
    },
    { rotulo: 'Novos', valor: contar('novo'), detalhe: 'Aguardando aceite' },
    { rotulo: 'Preparando', valor: contar('em_preparo'), detalhe: 'Em produção na cozinha' },
    { rotulo: 'Prontos', valor: contar('pronto'), detalhe: 'Aguardando saída ou retirada' },
  ];

  const controle = [styles.controle, { borderColor: cores.borda, backgroundColor: cores.superficie }];

  return (
    <Pagina
      titulo="Dashboard de pedidos"
      subtitulo="Acompanhe a cozinha e as entregas, sem trocar de aplicativo."
      acao={<Botao rotulo="Novo pedido" icone="mais" variante="primario" />}>
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
              onAvancar={() => avancar(pedido)}
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
