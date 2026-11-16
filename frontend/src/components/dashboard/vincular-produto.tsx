import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Campo } from './formularios';
import { Botao, Cartao, Chip, Divisor, Texto } from './ui';
import { Espacamento, Raio } from '@/constants/tokens';
import { PLATAFORMAS_DELIVERY } from '@/data/estoque';
import { formatarReais } from '@/data/pedidos';
import { useCores } from '@/hooks/use-cores';
import { ErroApi } from '@/services/http';
import { consultarProdutoNaPlataforma, type ProdutoNaPlataforma } from '@/services/api-integracao';
import { vincularProduto } from '@/services/api-produtos';

type Conferencia =
  | { tipo: 'conferindo' }
  | { tipo: 'encontrado'; produto: ProdutoNaPlataforma }
  | { tipo: 'nao-encontrado'; texto: string }
  | { tipo: 'indisponivel'; texto: string };

type EstadoPlataforma = { ativo: boolean; id: string; conferencia: Conferencia | null };

const ESTADO_INICIAL = Object.fromEntries(
  PLATAFORMAS_DELIVERY.map(({ id }) => [id, { ativo: false, id: '', conferencia: null }]),
) as Record<string, EstadoPlataforma>;

/**
 * O produto é cadastrado em cada plataforma de delivery, que gera um ID para ele. Aqui esses IDs
 * são ligados a um produto do Gerêncio, cujo estoque e preço passam a valer em todas elas.
 */
export function FormularioVinculo({ onConcluir, onFechar }: {
  onConcluir: (produtoId: number) => void; onFechar: () => void;
}) {
  const cores = useCores();
  const [plataformas, setPlataformas] = useState(ESTADO_INICIAL);
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');
  const [preco, setPreco] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const enviando = useRef(false);

  const atualizar = (plataforma: string, mudanca: Partial<EstadoPlataforma>) =>
    setPlataformas((atuais) => ({ ...atuais, [plataforma]: { ...atuais[plataforma]!, ...mudanca } }));

  /** Confere o ID na plataforma; o primeiro produto encontrado preenche nome, categoria e preço vazios. */
  const conferir = async (plataforma: string, id: string): Promise<Conferencia | null> => {
    if (!id.trim()) return null;
    atualizar(plataforma, { conferencia: { tipo: 'conferindo' } });
    let conferencia: Conferencia;
    try {
      const produto = await consultarProdutoNaPlataforma(plataforma, id);
      conferencia = { tipo: 'encontrado', produto };
      setNome((atual) => atual.trim() ? atual : produto.nome);
      setCategoria((atual) => atual.trim() ? atual : produto.categoria);
      setPreco((atual) => atual.trim() ? atual : produto.preco.toFixed(2).replace('.', ','));
    } catch (e) {
      conferencia = e instanceof ErroApi && e.status === 404
        ? { tipo: 'nao-encontrado', texto: e.message }
        : { tipo: 'indisponivel', texto: 'Não foi possível conferir o ID agora. O vínculo pode ser salvo assim mesmo.' };
    }
    // Só vale se o ID não mudou enquanto a consulta acontecia
    setPlataformas((atuais) => atuais[plataforma]!.id === id ? { ...atuais, [plataforma]: { ...atuais[plataforma]!, conferencia } } : atuais);
    return conferencia;
  };

  const salvar = async () => {
    if (enviando.current) return;
    const selecionadas = PLATAFORMAS_DELIVERY.filter(({ id }) => plataformas[id]!.ativo);
    const valor = Number(preco.replace(',', '.'));
    const saldo = Number(quantidade);
    if (selecionadas.length === 0) { setErro('Selecione ao menos uma plataforma e informe o ID do produto nela.'); return; }
    const semId = selecionadas.find(({ id }) => !plataformas[id]!.id.trim());
    if (semId) { setErro(`Informe o ID do produto no ${semId.nome}.`); return; }
    if (!nome.trim() || !preco.trim() || !Number.isFinite(valor) || valor < 0 ||
        !quantidade.trim() || !Number.isInteger(saldo) || saldo < 0 || saldo > 1_000_000) {
      setErro('Informe nome, preço válido e a quantidade em estoque (inteiro entre zero e 1.000.000).'); return;
    }
    enviando.current = true; setSalvando(true); setErro(null);
    try {
      // Confere de novo os IDs ainda não encontrados: um ID digitado errado não deve ser vinculado
      const resultados = await Promise.all(selecionadas.map(async ({ id, nome: nomePlataforma }) => {
        const estado = plataformas[id]!;
        const conferencia = estado.conferencia?.tipo === 'encontrado' ? estado.conferencia : await conferir(id, estado.id);
        return { nomePlataforma, conferencia };
      }));
      const naoEncontrado = resultados.find((r) => r.conferencia?.tipo === 'nao-encontrado');
      if (naoEncontrado) throw new Error(`Confira o ID no ${naoEncontrado.nomePlataforma}: ele não existe no cardápio da plataforma.`);
      const produto = await vincularProduto({
        nome: nome.trim(), categoria: categoria.trim() || 'Sem categoria', preco: valor, quantidade: saldo,
        vinculos: selecionadas.map(({ id }) => ({ plataforma: id, idExternoApp: plataformas[id]!.id.trim() })),
      });
      onConcluir(produto.id);
    } catch (e) { setErro((e as Error).message); }
    finally { enviando.current = false; setSalvando(false); }
  };

  return <Cartao style={[styles.formulario, { backgroundColor: cores.fundo }]}>
    <View style={styles.titulo}>
      <Texto tamanho={20} peso={600}>Vincular produto</Texto>
      <Texto cor="textoSecundario">
        Cadastre o produto em cada plataforma de delivery e informe aqui o ID que cada uma gerou. O estoque e o preço abaixo passam a valer para todas as plataformas vinculadas e para o WhatsApp.
      </Texto>
    </View>

    <Texto tamanho={16} peso={600}>Plataformas que vendem o produto</Texto>
    <View style={styles.linha}>
      {PLATAFORMAS_DELIVERY.map(({ id, nome: nomePlataforma }) => (
        <Chip key={id} rotulo={nomePlataforma} ativo={plataformas[id]!.ativo}
          onPress={salvando ? undefined : () => atualizar(id, { ativo: !plataformas[id]!.ativo })} />
      ))}
    </View>
    {PLATAFORMAS_DELIVERY.filter(({ id }) => plataformas[id]!.ativo).map(({ id, nome: nomePlataforma }) => {
      const estado = plataformas[id]!;
      const conferencia = estado.conferencia;
      return <View key={id} style={styles.plataforma}>
        <Texto peso={600} style={styles.nomePlataforma}>{nomePlataforma}</Texto>
        <View style={styles.acoes}>
          <TextInput accessibilityLabel={`ID no ${nomePlataforma}`} placeholder={`ID do produto no ${nomePlataforma}`}
            placeholderTextColor={cores.textoSecundario} value={estado.id} editable={!salvando}
            autoCapitalize="none" autoCorrect={false}
            onChangeText={(texto) => atualizar(id, { id: texto, conferencia: null })}
            onBlur={() => { if (estado.id.trim() && !conferencia) void conferir(id, estado.id); }}
            onSubmitEditing={() => void conferir(id, estado.id)}
            style={[styles.campoId, { color: cores.textoPrincipal, borderColor: cores.borda, backgroundColor: cores.superficie }]} />
          <Botao rotulo="Conferir" accessibilityLabel={`Conferir ID no ${nomePlataforma}`} disabled={salvando || !estado.id.trim()}
            onPress={() => void conferir(id, estado.id)} />
        </View>
        {conferencia?.tipo === 'conferindo' && <Texto cor="textoSecundario" style={styles.situacao}>Conferindo no {nomePlataforma}…</Texto>}
        {conferencia?.tipo === 'encontrado' && (
          <Texto style={styles.situacao}>
            ✓ {conferencia.produto.nome} • {formatarReais(conferencia.produto.preco)} • {conferencia.produto.quantidade} un. no {nomePlataforma}
          </Texto>
        )}
        {conferencia?.tipo === 'nao-encontrado' && <Texto cor="feedbackErro" style={styles.situacao}>{conferencia.texto}</Texto>}
        {conferencia?.tipo === 'indisponivel' && <Texto cor="textoSecundario" style={styles.situacao}>{conferencia.texto}</Texto>}
      </View>;
    })}

    <Divisor />

    <Texto tamanho={16} peso={600}>Dados no Gerêncio</Texto>
    <Campo rotulo="Nome do produto" value={nome} onChangeText={setNome} editable={!salvando} />
    <Campo rotulo="Categoria (opcional)" value={categoria} onChangeText={setCategoria} editable={!salvando} />
    <Campo rotulo="Preço (R$)" value={preco} onChangeText={setPreco} keyboardType="decimal-pad" editable={!salvando} />
    <Campo rotulo="Quantidade em estoque" value={quantidade} onChangeText={setQuantidade} keyboardType="number-pad" editable={!salvando} />
    <Texto cor="textoSecundario">
      Se a quantidade cadastrada em alguma plataforma estiver diferente, vale a informada aqui: ela é enviada a todas as plataformas vinculadas.
    </Texto>
    {erro && <Texto cor="feedbackErro" accessibilityRole="alert">{erro}</Texto>}
    <View style={styles.linha}>
      <Botao rotulo={salvando ? 'Vinculando…' : 'Vincular produto'} icone="sincronizar" variante="primario" disabled={salvando} onPress={salvar} />
      <Botao rotulo="Fechar" disabled={salvando} onPress={onFechar} />
    </View>
  </Cartao>;
}

const styles = StyleSheet.create({
  formulario: { gap: Espacamento.large },
  titulo: { gap: Espacamento.xsmall },
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: Espacamento.small },
  plataforma: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Espacamento.small },
  nomePlataforma: { width: 96 },
  acoes: { flex: 1, minWidth: 240, flexDirection: 'row', alignItems: 'center', gap: Espacamento.small },
  campoId: { flex: 1, minWidth: 0, maxWidth: 320, minHeight: 44, borderWidth: 1, borderRadius: Raio.small, padding: Espacamento.small, fontSize: 16 },
  situacao: { flexBasis: '100%' },
});
