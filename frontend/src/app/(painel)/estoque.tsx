import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { FormularioProduto } from '@/components/dashboard/novo-produto';
import { Campo, SeletorRestaurante } from '@/components/dashboard/formularios';
import { CartaoResumo, Grade, Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import { Aviso, Botao, Cartao, Chip, Divisor, Etiqueta, Texto } from '@/components/dashboard/ui';
import { Espacamento, Raio } from '@/constants/tokens';
import { formatarHora, formatarReais } from '@/data/pedidos';
import { useCores } from '@/hooks/use-cores';
import { listarProdutos, listarRestaurantes, salvarEstoque, type Produto, type Restaurante } from '@/services/api-produtos';

type Filtro = 'todos' | 'disponiveis' | 'esgotados';
type Rascunho = { valor: string; versaoEstoque: number };
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' }, { id: 'disponiveis', rotulo: 'Disponíveis' }, { id: 'esgotados', rotulo: 'Esgotados' },
];

export default function GestaoDeEstoque() {
  const cores = useCores();
  const largura = useLarguraConteudo();
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([]);
  const [restauranteId, setRestauranteId] = useState<number>();
  const [rascunhos, setRascunhos] = useState<Record<number, Rascunho>>({});
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [novoProduto, setNovoProduto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroRestaurantes, setErroRestaurantes] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const consulta = useRef(0);
  const enviando = useRef(false);

  useEffect(() => {
    let ativo = true;
    const atualizar = () => listarRestaurantes().then((dados) => {
      if (ativo) { setRestaurantes(dados); setErroRestaurantes(null); }
    }).catch((e: Error) => { if (ativo) setErroRestaurantes(e.message); });
    atualizar();
    const intervalo = setInterval(atualizar, 10_000);
    return () => { ativo = false; clearInterval(intervalo); };
  }, []);

  const carregar = useCallback(async () => {
    const versao = ++consulta.current;
    try {
      const dados = await listarProdutos(restauranteId);
      if (versao !== consulta.current) return;
      setProdutos(dados); setAtualizadoEm(new Date()); setErro(null);
    } catch (e) { if (versao === consulta.current) setErro((e as Error).message); }
  }, [restauranteId]);

  const pendentes = Object.keys(rascunhos).length;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carregar atualiza o estado somente após a resposta HTTP.
    carregar();
    return () => { consulta.current += 1; };
  }, [carregar]);

  // Durante a edição, a versão original acompanha o rascunho até o servidor confirmar o ajuste.
  useEffect(() => {
    if (pendentes || salvando) return;
    const intervalo = setInterval(carregar, 10_000);
    return () => clearInterval(intervalo);
  }, [carregar, pendentes, salvando]);

  const editar = (produto: Produto, valor: string) => {
    setRascunhos((atuais) => {
      const novos = { ...atuais };
      if (valor.trim() !== '' && Number(valor) === produto.quantidade) delete novos[produto.id];
      else novos[produto.id] = { valor, versaoEstoque: atuais[produto.id]?.versaoEstoque ?? produto.versaoEstoque };
      return novos;
    });
  };

  const salvar = async () => {
    if (enviando.current) return;
    const ajustes = Object.entries(rascunhos).map(([id, r]) => ({ produtoId: Number(id), quantidade: Number(r.valor), versaoEstoque: r.versaoEstoque }));
    if (Object.values(rascunhos).some((r) => !r.valor.trim()) || ajustes.some((a) => !Number.isInteger(a.quantidade) || a.quantidade < 0 || a.quantidade > 1_000_000)) {
      setErro('Use quantidades inteiras entre zero e 1.000.000.'); return;
    }
    enviando.current = true; setSalvando(true); setErro(null); consulta.current += 1;
    try {
      const salvos = await salvarEstoque(ajustes);
      setProdutos((atuais) => (atuais ?? []).map((p) => salvos.find((s) => s.id === p.id) ?? p));
      setRascunhos({}); setAtualizadoEm(new Date());
    } catch (e) { setErro((e as Error).message); }
    finally { enviando.current = false; setSalvando(false); }
  };

  const lista = produtos ?? [];
  const disponiveis = lista.filter((p) => p.quantidade > 0).length;
  const contagem = { todos: lista.length, disponiveis, esgotados: lista.length - disponiveis };
  const visiveis = lista.filter((p) =>
    (filtro === 'todos' || (filtro === 'disponiveis' ? p.quantidade > 0 : p.quantidade === 0)) &&
    p.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <Pagina titulo="Gestão de estoque" subtitulo="Consulte o saldo real e ajuste as unidades disponíveis para venda."
      acao={<Botao rotulo="Cadastrar produto" icone="mais" variante="primario" disabled={!restaurantes.length || salvando || pendentes > 0} onPress={() => setNovoProduto(true)} />}>
      <SeletorRestaurante restaurantes={restaurantes} valor={restauranteId} onChange={(id) => {
        consulta.current += 1; setProdutos(null); setAtualizadoEm(null); setRestauranteId(id);
      }} todos desabilitado={pendentes > 0 || salvando || novoProduto} />
      {erroRestaurantes && <Texto cor="feedbackErro" accessibilityRole="alert">Restaurantes: {erroRestaurantes}</Texto>}
      {!erroRestaurantes && restaurantes.length === 0 && <Texto cor="textoSecundario">É necessário cadastrar um restaurante antes de criar produtos.</Texto>}
      {novoProduto && <FormularioProduto restaurantes={restaurantes} restauranteInicial={restauranteId}
        onFechar={() => setNovoProduto(false)} onConcluir={(id) => {
          setNovoProduto(false); setFiltro('todos'); setBusca('');
          if (restauranteId !== undefined && restauranteId !== id) {
            consulta.current += 1; setProdutos(null); setAtualizadoEm(null); setRestauranteId(id);
          } else carregar();
        }} />}
      <Grade colunas={largura >= 900 ? 3 : 1}>
        <CartaoResumo rotulo="Produtos cadastrados" valor={produtos ? lista.length : '—'} detalhe="Catálogo salvo no Gerôncio" />
        <CartaoResumo rotulo="Disponíveis" valor={produtos ? disponiveis : '—'} detalhe={contagem.esgotados + ' produtos com saldo zero'} />
        <CartaoResumo rotulo="Ajustes pendentes" valor={pendentes} detalhe="Alterações ainda não salvas" />
      </Grade>
      {pendentes > 0 && <Aviso icone="salvar" titulo="Há ajustes para salvar" texto="Os pedidos usam o último saldo salvo. Salve seus ajustes antes de trocar de página ou restaurante." />}
      {erro && <Cartao><Texto cor="feedbackErro" accessibilityRole="alert">{erro}</Texto></Cartao>}
      <Cartao style={styles.bloco}>
        <View style={styles.linha}>
          <Texto tamanho={18} peso={500}>Saldo por produto</Texto>
          <Texto cor="textoSecundario">{atualizadoEm ? 'Atualizado às ' + formatarHora(atualizadoEm) : 'Aguardando dados'}</Texto>
          <Botao rotulo={pendentes ? 'Descartar ajustes e recarregar' : 'Atualizar'} icone="sincronizar" disabled={salvando}
            onPress={() => { setRascunhos({}); carregar(); }} />
        </View>
        <Campo rotulo="Buscar produto" value={busca} onChangeText={setBusca} placeholder="Nome do produto" />
        <View style={styles.linha}>
          {FILTROS.map(({ id, rotulo }) => <Chip key={id} rotulo={rotulo + ' · ' + contagem[id]} ativo={filtro === id} onPress={() => setFiltro(id)} />)}
        </View>
        {visiveis.map((p) => {
          const rascunho = rascunhos[p.id];
          const valor = rascunho?.valor ?? String(p.quantidade);
          return <View key={p.id} style={styles.bloco}>
            <View style={styles.linha}>
              <View style={styles.produto}>
                <Texto tamanho={16} peso={600}>{p.nome}</Texto>
                <Texto cor="textoSecundario">{p.categoria} • {formatarReais(p.preco)}</Texto>
                <Texto cor="textoSecundario">{p.restaurante?.nome}</Texto>
                <Texto cor="textoSecundario">Salvo: {p.quantidade} un.{rascunho ? ' • Ajuste pendente' : ''}</Texto>
              </View>
              <View style={styles.linha}>
                <Botao rotulo="−" accessibilityLabel={'Diminuir ' + p.nome} disabled={salvando || novoProduto || Number(valor) <= 0}
                  onPress={() => editar(p, String(Math.max(0, (Number(valor) || 0) - 1)))} />
                <TextInput accessibilityLabel={'Quantidade de ' + p.nome} keyboardType="number-pad" value={valor} editable={!salvando && !novoProduto}
                  onChangeText={(texto) => editar(p, texto)} style={[styles.quantidade, { color: cores.textoPrincipal, borderColor: cores.borda }]} />
                <Botao rotulo="+" accessibilityLabel={'Aumentar ' + p.nome} disabled={salvando || novoProduto || Number(valor) >= 1_000_000}
                  onPress={() => editar(p, String((Number(valor) || 0) + 1))} />
              </View>
              <Etiqueta rotulo={p.quantidade > 0 ? 'Disponível' : 'Esgotado'} corPonto={p.quantidade > 0 ? cores.statusEntregue : cores.statusCancelado} />
            </View>
            <Divisor />
          </View>;
        })}
        {visiveis.length === 0 && <Texto cor="textoSecundario">{produtos === null ? (erro ? 'Estoque indisponível.' : 'Carregando estoque…') : 'Nenhum produto encontrado.'}</Texto>}
        <Botao rotulo={salvando ? 'Salvando…' : 'Salvar ajustes'} icone="salvar" variante="primario" disabled={!pendentes || salvando} onPress={salvar} />
      </Cartao>
      <Aviso icone="info" titulo="Estoque local do restaurante"
        texto="Ao aceitar um pedido, as unidades são reservadas. Cancelamentos antes da saída devolvem essa reserva. O envio do saldo para os aplicativos de delivery ainda não está disponível." />
    </Pagina>
  );
}

const styles = StyleSheet.create({
  bloco: { gap: Espacamento.large },
  linha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Espacamento.small },
  produto: { flex: 1, minWidth: 180, gap: Espacamento.xsmall },
  quantidade: { width: 80, minHeight: 44, borderWidth: 1, borderRadius: Raio.small, padding: Espacamento.small, fontSize: 16, textAlign: 'center' },
});
