import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Campo } from './formularios';
import { Botao, Cartao, Divisor, Etiqueta, Texto } from './ui';
import { Espacamento, Raio } from '@/constants/tokens';
import { PLATAFORMAS_DELIVERY } from '@/data/estoque';
import { useCores } from '@/hooks/use-cores';
import {
  atualizarProduto,
  criarMapeamento,
  excluirProduto,
  removerMapeamento,
  type Mapeamento,
  type Produto,
} from '@/services/api-produtos';

type Secao = 'dados' | 'codigos' | 'exclusao';
type Mensagem = { secao: Secao; texto: string; erro: boolean };

// Mapeamentos antigos podem estar gravados como "IFOOD" ou "Uber Eats".
const mesmaPlataforma = (gravada: string, id: string) => gravada.toLowerCase().replace(/[\s_-]+/g, '') === id;

/** Edita os dados do produto, os códigos dele em cada plataforma e permite excluí-lo. */
export function FormularioEdicaoProduto({ produto, mapeamentos, onAlterado, onExcluido, onFechar }: {
  produto: Produto;
  mapeamentos: Mapeamento[];
  onAlterado: () => Promise<void>;
  onExcluido: () => void;
  onFechar: () => void;
}) {
  const cores = useCores();
  const [nome, setNome] = useState(produto.nome);
  const [categoria, setCategoria] = useState(produto.categoria);
  const [preco, setPreco] = useState(produto.preco.toFixed(2).replace('.', ','));
  const [codigos, setCodigos] = useState<Record<string, string>>({});
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [salvando, setSalvando] = useState(false);
  const enviando = useRef(false);

  // Uma operação por vez; a mensagem aparece junto da seção que a originou.
  const executar = async (secao: Secao, acao: () => Promise<string | null>) => {
    if (enviando.current) return;
    enviando.current = true; setSalvando(true); setMensagem(null);
    try {
      const sucesso = await acao();
      if (sucesso) setMensagem({ secao, texto: sucesso, erro: false });
    } catch (e) { setMensagem({ secao, texto: (e as Error).message, erro: true }); }
    finally { enviando.current = false; setSalvando(false); }
  };

  const salvarDados = () => executar('dados', async () => {
    const valor = Number(preco.replace(',', '.'));
    if (!nome.trim() || !categoria.trim() || !preco.trim() || !Number.isFinite(valor) || valor < 0) {
      throw new Error('Informe nome, categoria e preço válido.');
    }
    await atualizarProduto(produto.id, { nome: nome.trim(), categoria: categoria.trim(), preco: valor });
    await onAlterado();
    return 'Dados do produto salvos.';
  });

  const adicionarCodigo = (plataforma: string, nomePlataforma: string) => executar('codigos', async () => {
    const codigo = (codigos[plataforma] ?? '').trim();
    if (!codigo) throw new Error(`Informe o código do produto no ${nomePlataforma}.`);
    await criarMapeamento({ produtoId: produto.id, plataforma, idExternoApp: codigo });
    setCodigos((atuais) => ({ ...atuais, [plataforma]: '' }));
    await onAlterado();
    return `Código ${codigo} ligado ao ${nomePlataforma}.`;
  });

  const removerCodigo = (mapeamento: Mapeamento, nomePlataforma: string) => executar('codigos', async () => {
    await removerMapeamento(mapeamento.id);
    await onAlterado();
    return `Código removido do ${nomePlataforma}.`;
  });

  const excluir = () => executar('exclusao', async () => {
    await excluirProduto(produto.id);
    onExcluido();
    return null;
  });

  const aviso = (secao: Secao) => mensagem?.secao === secao && (
    <Texto peso={500} cor={mensagem.erro ? 'feedbackErro' : 'textoPrincipal'} accessibilityRole="alert">{mensagem.texto}</Texto>
  );

  return <Cartao style={[styles.formulario, { backgroundColor: cores.fundo }]}>
    <View style={styles.cabecalho}>
      <View style={styles.titulo}>
        <Texto tamanho={20} peso={600}>Editar produto</Texto>
        <Texto cor="textoSecundario">
          {produto.restaurante?.nome ? produto.restaurante.nome + ' • ' : ''}Saldo salvo: {produto.quantidade} un. A quantidade é ajustada na lista de saldo.
        </Texto>
      </View>
      <Botao rotulo="Fechar" icone="fechar" disabled={salvando} onPress={onFechar} />
    </View>

    <Texto tamanho={16} peso={600}>Dados do produto</Texto>
    <Campo rotulo="Nome do produto" value={nome} onChangeText={setNome} editable={!salvando} />
    <Campo rotulo="Categoria" value={categoria} onChangeText={setCategoria} editable={!salvando} />
    <Campo rotulo="Preço (R$)" value={preco} onChangeText={setPreco} keyboardType="decimal-pad" editable={!salvando} />
    {aviso('dados')}
    <View style={styles.linha}>
      <Botao rotulo={salvando ? 'Salvando…' : 'Salvar dados'} icone="salvar" variante="primario" disabled={salvando} onPress={salvarDados} />
    </View>

    <Divisor />

    <View style={styles.titulo}>
      <Texto tamanho={16} peso={600}>Códigos nas plataformas</Texto>
      <Texto cor="textoSecundario">
        Cada aplicativo identifica o produto por um código próprio (SKU). Os pedidos que chegam com esse código são ligados a este produto e baixam o estoque dele.
      </Texto>
    </View>
    {PLATAFORMAS_DELIVERY.map(({ id, nome: nomePlataforma }) => {
      const mapeamento = mapeamentos.find((m) => mesmaPlataforma(m.plataforma, id));
      return <View key={id} style={styles.plataforma}>
        <Texto peso={600} style={styles.nomePlataforma}>{nomePlataforma}</Texto>
        {/* Código e botão ficam juntos; em telas estreitas descem abaixo do nome. */}
        <View style={styles.acoesPlataforma}>{mapeamento ? <>
          <Etiqueta rotulo={mapeamento.idExternoApp} corPonto={cores.statusEntregue} />
          <Botao rotulo="Remover" accessibilityLabel={`Remover código do ${nomePlataforma}`} disabled={salvando}
            onPress={() => removerCodigo(mapeamento, nomePlataforma)} />
        </> : <>
          <TextInput accessibilityLabel={`Código no ${nomePlataforma}`} placeholder="Sem código" placeholderTextColor={cores.textoSecundario}
            value={codigos[id] ?? ''} editable={!salvando} autoCapitalize="none" autoCorrect={false}
            onChangeText={(texto) => setCodigos((atuais) => ({ ...atuais, [id]: texto }))}
            onSubmitEditing={() => adicionarCodigo(id, nomePlataforma)}
            style={[styles.codigo, { color: cores.textoPrincipal, borderColor: cores.borda, backgroundColor: cores.superficie }]} />
          <Botao rotulo="Adicionar" icone="mais" accessibilityLabel={`Adicionar código do ${nomePlataforma}`} disabled={salvando}
            onPress={() => adicionarCodigo(id, nomePlataforma)} />
        </>}</View>
      </View>;
    })}
    {aviso('codigos')}

    <Divisor />

    {confirmarExclusao ? <View style={styles.titulo}>
      <Texto peso={500}>Excluir {produto.nome}? Os códigos nas plataformas também serão apagados. Produtos que já aparecem em pedidos não podem ser excluídos.</Texto>
      <View style={styles.linha}>
        <Botao rotulo={salvando ? 'Excluindo…' : 'Confirmar exclusão'} disabled={salvando} onPress={excluir} />
        <Botao rotulo="Manter produto" disabled={salvando} onPress={() => { setConfirmarExclusao(false); setMensagem(null); }} />
      </View>
    </View> : <View style={styles.linha}>
      <Botao rotulo="Excluir produto" disabled={salvando} onPress={() => { setConfirmarExclusao(true); setMensagem(null); }} />
    </View>}
    {aviso('exclusao')}
  </Cartao>;
}

const styles = StyleSheet.create({
  formulario: { gap: Espacamento.large },
  cabecalho: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: Espacamento.small },
  titulo: { flex: 1, minWidth: 220, gap: Espacamento.xsmall },
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: Espacamento.small },
  plataforma: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Espacamento.small },
  nomePlataforma: { width: 96 },
  acoesPlataforma: { flex: 1, minWidth: 240, flexDirection: 'row', alignItems: 'center', gap: Espacamento.small },
  codigo: { flex: 1, minWidth: 0, maxWidth: 320, minHeight: 44, borderWidth: 1, borderRadius: Raio.small, padding: Espacamento.small, fontSize: 16 },
});
