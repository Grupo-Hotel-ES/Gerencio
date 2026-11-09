import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Campo } from '@/components/dashboard/formularios';
import { CartaoResumo, Grade, Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import { Botao, Cartao, Icone, Texto } from '@/components/dashboard/ui';
import { Espacamento, Raio } from '@/constants/tokens';
import type { Cliente } from '@/data/clientes';
import { useCores } from '@/hooks/use-cores';
import { atualizarCliente, criarCliente, excluirCliente, listarClientes } from '@/services/api-clientes';

export default function Clientes() {
  const cores = useCores();
  const largura = useLarguraConteudo();
  const compacto = largura < 720;

  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  // Formulário de cadastro/edição
  const [aberto, setAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Cliente | null>(null);
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [telefone, setTelefone] = useState('');
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Exclusão pede confirmação com um segundo toque
  const [confirmarExclusao, setConfirmarExclusao] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      setClientes(await listarClientes());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
      setClientes((atuais) => atuais ?? []);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carregar atualiza o estado somente após a resposta HTTP.
    carregar();
  }, [carregar]);

  const abrir = (cliente: Cliente | null) => {
    setEmEdicao(cliente);
    setNome(cliente?.nome ?? '');
    setEndereco(cliente?.endereco ?? '');
    setTelefone(cliente?.telefone ?? '');
    setErroForm(null);
    setAberto(true);
  };

  const salvar = async () => {
    if (!nome.trim() || !endereco.trim()) { setErroForm('Nome e endereço são obrigatórios.'); return; }
    setSalvando(true); setErroForm(null);
    try {
      const dados = { nome, endereco, telefone };
      if (emEdicao) await atualizarCliente(emEdicao.id, dados);
      else await criarCliente(dados);
      setAberto(false);
      await carregar();
    } catch (e) {
      setErroForm((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (cliente: Cliente) => {
    if (confirmarExclusao !== cliente.id) { setConfirmarExclusao(cliente.id); return; }
    setConfirmarExclusao(null);
    try {
      await excluirCliente(cliente.id);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const lista = clientes ?? [];
  const termo = busca.trim().toLowerCase();
  const visiveis = lista.filter((c) => !termo
    || c.nome.toLowerCase().includes(termo)
    || c.endereco.toLowerCase().includes(termo)
    || (c.telefone ?? '').includes(termo));
  const comTelefone = lista.filter((c) => c.telefone).length;
  const comPedidos = lista.filter((c) => c.pedidos > 0).length;

  return (
    <Pagina
      titulo="Clientes"
      subtitulo="Cadastro de clientes. Pedidos manuais e das plataformas criam o cliente automaticamente."
      acao={<Botao rotulo="Cadastrar cliente" icone="mais" variante="primario" onPress={() => abrir(null)} />}>
      <Grade colunas={compacto ? 1 : 3}>
        <CartaoResumo rotulo="Clientes cadastrados" valor={lista.length} detalhe="Todos os canais" />
        <CartaoResumo rotulo="Com pedidos" valor={comPedidos} detalhe="Já pediram ao menos uma vez" />
        <CartaoResumo rotulo="Com telefone" valor={comTelefone} detalhe="Podem ser contatados" />
      </Grade>

      {erro && (
        <Cartao style={[styles.aviso, { borderColor: cores.feedbackErro }]}>
          <Texto accessibilityRole="alert" style={styles.flex}>{erro}</Texto>
          <Botao rotulo="Fechar" onPress={() => setErro(null)} />
        </Cartao>
      )}

      {aberto && (
        <Cartao style={styles.formulario}>
          <View style={styles.linhaTitulo}>
            <Texto tamanho={18} peso={600}>{emEdicao ? `Editar cliente: ${emEdicao.nome}` : 'Cadastrar cliente'}</Texto>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar formulário" onPress={() => setAberto(false)}>
              <Icone nome="fechar" />
            </Pressable>
          </View>
          <Campo rotulo="Nome *" value={nome} onChangeText={setNome} editable={!salvando} />
          <Campo rotulo="Endereço *" value={endereco} onChangeText={setEndereco} editable={!salvando} />
          <Campo rotulo="Telefone" value={telefone} onChangeText={setTelefone} keyboardType="phone-pad"
            placeholder="Opcional" editable={!salvando} />
          {erroForm && <Texto cor="feedbackErro" accessibilityRole="alert">{erroForm}</Texto>}
          <View style={styles.botoes}>
            <Botao rotulo="Cancelar" disabled={salvando} onPress={() => setAberto(false)} />
            <Botao rotulo={salvando ? 'Salvando…' : emEdicao ? 'Salvar alterações' : 'Cadastrar'} icone="salvar"
              variante="primario" disabled={salvando} onPress={salvar} />
          </View>
        </Cartao>
      )}

      <Cartao style={styles.tabela}>
        <View style={styles.linhaTitulo}>
          <Texto accessibilityRole="header" tamanho={18} peso={600}>Clientes</Texto>
          <View style={[styles.busca, { borderColor: cores.borda, backgroundColor: cores.superficie }]}>
            <Icone nome="busca" />
            <TextInput value={busca} onChangeText={setBusca} placeholder="Nome, endereço ou telefone"
              placeholderTextColor={cores.textoSecundario} accessibilityLabel="Buscar cliente"
              style={[styles.campoBusca, { color: cores.textoPrincipal }]} />
          </View>
        </View>

        {clientes === null && <Texto cor="textoSecundario">Carregando clientes…</Texto>}
        {clientes !== null && visiveis.length === 0 && (
          <Texto cor="textoSecundario">{termo ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</Texto>
        )}

        {visiveis.map((c) => (
          <View key={c.id} style={[styles.linha, { borderColor: cores.borda }]}>
            <View style={styles.dados}>
              <Texto peso={600}>{c.nome}</Texto>
              <Texto cor="textoSecundario">{c.endereco}</Texto>
              {compacto && <Texto cor="textoSecundario">{c.telefone ?? 'Sem telefone'}</Texto>}
            </View>
            {!compacto && <Texto style={styles.telefone} cor={c.telefone ? 'textoPrincipal' : 'textoSecundario'}>{c.telefone ?? 'Sem telefone'}</Texto>}
            <Texto style={styles.pedidos} cor="textoSecundario">{c.pedidos} {c.pedidos === 1 ? 'pedido' : 'pedidos'}</Texto>
            <View style={styles.acoes}>
              <Botao rotulo="Editar" icone="editar" accessibilityLabel={`Editar ${c.nome}`} onPress={() => abrir(c)} />
              {c.pedidos === 0 && (
                <Botao rotulo={confirmarExclusao === c.id ? 'Confirmar' : 'Excluir'} icone="fechar"
                  accessibilityLabel={`Excluir ${c.nome}`} onPress={() => excluir(c)} />
              )}
            </View>
          </View>
        ))}
      </Cartao>
    </Pagina>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: Espacamento.medium, borderWidth: 1 },
  formulario: { gap: Espacamento.large },
  linhaTitulo: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: Espacamento.medium },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Espacamento.small },
  tabela: { gap: Espacamento.medium },
  busca: {
    flexDirection: 'row', alignItems: 'center', gap: Espacamento.small, borderWidth: 1,
    borderRadius: Raio.small, paddingHorizontal: Espacamento.medium, minHeight: 44, minWidth: 260,
  },
  campoBusca: { flex: 1, fontSize: 16, paddingVertical: Espacamento.small },
  linha: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Espacamento.medium,
    borderTopWidth: 1, paddingTop: Espacamento.medium,
  },
  dados: { flex: 1, minWidth: 200, gap: Espacamento.xsmall },
  telefone: { width: 160 },
  pedidos: { width: 90 },
  acoes: { flexDirection: 'row', gap: Espacamento.small },
});
