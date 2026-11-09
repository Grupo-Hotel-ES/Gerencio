import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Alternador, CampoTexto, Colunas, estilos } from './campos';
import { Botao, Cartao, Chip, Divisor, Etiqueta, Texto } from '@/components/dashboard/ui';
import { useSessao } from '@/data/sessao';
import { useCores } from '@/hooks/use-cores';
import {
  PAPEIS,
  cadastrarUsuario,
  editarUsuario,
  listarUsuarios,
  removerUsuario,
  rotuloPapel,
  type PapelUsuario,
  type Usuario,
} from '@/services/api-conta';

function SeletorPapel({ valor, onChange, desabilitado }: { valor: PapelUsuario; onChange: (papel: PapelUsuario) => void; desabilitado?: boolean }) {
  return (
    <View style={estilos.chips}>
      {PAPEIS.map((p) => (
        <Chip key={p.id} rotulo={p.rotulo} ativo={valor === p.id} onPress={desabilitado || valor === p.id ? undefined : () => onChange(p.id)} />
      ))}
    </View>
  );
}

/** Edição de um usuário da lista: função, ativo e nova senha. */
function EditorUsuario({ usuario, ehVoce, onSalvo, onFechar }: {
  usuario: Usuario; ehVoce: boolean; onSalvo: (usuario: Usuario) => void; onFechar: () => void;
}) {
  const [papel, setPapel] = useState(usuario.papel);
  const [ativo, setAtivo] = useState(usuario.ativo);
  const [senha, setSenha] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    setSalvando(true); setErro(null);
    try {
      onSalvo(await editarUsuario(usuario.id, { papel, ativo, ...(senha && { senha }) }));
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  };

  return (
    <View style={estilos.cartaoLateral}>
      <Texto tamanho={13} peso={500}>Função</Texto>
      <SeletorPapel valor={papel} onChange={setPapel} desabilitado={salvando} />
      {!ehVoce && <Alternador rotulo="Acesso ativo" descricao="Sem acesso ativo, a pessoa não consegue entrar." valor={ativo} onChange={setAtivo} desabilitado={salvando} />}
      <CampoTexto rotulo="Nova senha" value={senha} onChangeText={setSenha} secureTextEntry placeholder="Deixe vazio para manter" ajuda="Mínimo de 6 caracteres." editable={!salvando} />
      {erro && <Texto tamanho={13} cor="feedbackErro" accessibilityRole="alert">{erro}</Texto>}
      <View style={estilos.linhaBotoes}>
        <Botao rotulo="Cancelar" disabled={salvando} onPress={onFechar} />
        <Botao rotulo={salvando ? 'Salvando…' : 'Salvar'} icone="salvar" variante="primario" disabled={salvando || (senha.length > 0 && senha.length < 6)} onPress={salvar} />
      </View>
    </View>
  );
}

/** Equipe que acessa o painel. Só administradores veem esta aba. */
export function AbaUsuarios({ emColunas, nomeRestaurante }: { emColunas: boolean; nomeRestaurante: string }) {
  const cores = useCores();
  const { usuario: eu } = useSessao();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<number | null>(null);
  const [removendo, setRemovendo] = useState<number | null>(null);

  // Cadastro
  const [nome, setNome] = useState('');
  const [login, setLogin] = useState('');
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<PapelUsuario>('operador');
  const [senha, setSenha] = useState('');
  const [cadastrando, setCadastrando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      setUsuarios(await listarUsuarios());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carregar atualiza o estado somente após a resposta HTTP.
    carregar();
  }, [carregar]);

  const cadastrar = async () => {
    if (!nome.trim() || !login.trim() || senha.length < 6) {
      setAviso({ ok: false, texto: 'Informe nome, usuário e uma senha com ao menos 6 caracteres.' }); return;
    }
    setCadastrando(true); setAviso(null);
    try {
      const novo = await cadastrarUsuario({ nome: nome.trim(), login: login.trim().toLowerCase(), email: email.trim(), papel, senha });
      setNome(''); setLogin(''); setEmail(''); setSenha(''); setPapel('operador');
      setAviso({ ok: true, texto: `✓ ${novo.nome} já pode entrar com o usuário ${novo.login}.` });
      await carregar();
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setCadastrando(false);
    }
  };

  const remover = async (id: number) => {
    try {
      await removerUsuario(id);
      setRemovendo(null);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const termo = busca.trim().toLowerCase();
  const visiveis = (usuarios ?? []).filter((u) =>
    !termo || [u.nome, u.login, u.email].some((campo) => campo.toLowerCase().includes(termo)));
  const ativos = (usuarios ?? []).filter((u) => u.ativo).length;

  const principal = (
    <>
      <Cartao style={estilos.cartaoForm}>
        <Texto accessibilityRole="header" tamanho={18} peso={600}>Equipe do {nomeRestaurante}</Texto>
        <Texto tamanho={13} cor="textoSecundario">
          {usuarios ? `${ativos} ${ativos === 1 ? 'acesso ativo' : 'acessos ativos'} • ${usuarios.length} no total` : 'Carregando…'}
        </Texto>
        <CampoTexto rotulo="Buscar" value={busca} onChangeText={setBusca} placeholder="Nome, usuário ou e-mail" autoCapitalize="none" />
        {erro && <Texto cor="feedbackErro" accessibilityRole="alert">{erro}</Texto>}
        {!usuarios && !erro && <ActivityIndicator color={cores.textoPrincipal} />}

        {visiveis.map((u, i) => {
          const ehVoce = u.id === eu?.id;
          return (
            <View key={u.id} style={{ gap: 8 }}>
              {i > 0 && <Divisor />}
              <View style={estilos.linhaUsuario}>
                <View style={estilos.flex}>
                  <Texto tamanho={16} peso={500}>{u.nome}{ehVoce ? ' (você)' : ''}</Texto>
                  <Texto tamanho={13} cor="textoSecundario">
                    {[u.login, u.email, rotuloPapel(u.papel)].filter(Boolean).join(' • ')}
                  </Texto>
                </View>
                <Etiqueta rotulo={u.ativo ? 'Ativo' : 'Inativo'} corPonto={u.ativo ? cores.statusEntregue : cores.statusCancelado} />
              </View>
              {editando === u.id ? (
                <EditorUsuario
                  usuario={u}
                  ehVoce={ehVoce}
                  onFechar={() => setEditando(null)}
                  onSalvo={(atualizado) => {
                    setUsuarios((lista) => lista?.map((x) => (x.id === atualizado.id ? atualizado : x)) ?? null);
                    setEditando(null);
                  }}
                />
              ) : removendo === u.id ? (
                <View style={estilos.linhaBotoes}>
                  <Texto style={estilos.flex}>Remover o acesso de {u.nome}?</Texto>
                  <Botao rotulo="Remover" variante="primario" onPress={() => remover(u.id)} />
                  <Botao rotulo="Manter" onPress={() => setRemovendo(null)} />
                </View>
              ) : (
                <View style={estilos.linhaBotoes}>
                  <Botao rotulo="Editar" icone="editar" onPress={() => { setEditando(u.id); setRemovendo(null); }} />
                  {!ehVoce && <Botao rotulo="Remover" icone="fechar" onPress={() => { setRemovendo(u.id); setEditando(null); }} />}
                </View>
              )}
            </View>
          );
        })}
        {usuarios && visiveis.length === 0 && <Texto cor="textoSecundario">Nenhum usuário encontrado.</Texto>}
      </Cartao>

      <Cartao style={estilos.cartaoForm}>
        <Texto accessibilityRole="header" tamanho={18} peso={600}>Funções e permissões</Texto>
        {PAPEIS.map((p, i) => (
          <View key={p.id} style={{ gap: 8 }}>
            {i > 0 && <Divisor />}
            <Texto peso={600}>{p.rotulo}</Texto>
            <Texto tamanho={13} cor="textoSecundario">{p.descricao}</Texto>
          </View>
        ))}
      </Cartao>
    </>
  );

  const lateral = (
    <Cartao style={estilos.cartaoLateral}>
      <Texto accessibilityRole="header" tamanho={18} peso={600}>Cadastrar usuário</Texto>
      <Texto tamanho={13} cor="textoSecundario">
        Combine a senha inicial com a pessoa; ela pode trocá-la depois em Perfil.
      </Texto>
      <CampoTexto rotulo="Nome *" value={nome} onChangeText={setNome} editable={!cadastrando} />
      <CampoTexto rotulo="Usuário *" value={login} onChangeText={(t) => setLogin(t.toLowerCase())} autoCapitalize="none" autoCorrect={false}
        placeholder="ex.: maria.silva" ajuda="Letras minúsculas, números, ponto, hífen ou sublinhado." editable={!cadastrando} />
      <CampoTexto rotulo="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" editable={!cadastrando} />
      <Texto tamanho={13} peso={500}>Função *</Texto>
      <SeletorPapel valor={papel} onChange={setPapel} desabilitado={cadastrando} />
      <CampoTexto rotulo="Senha inicial *" value={senha} onChangeText={setSenha} secureTextEntry ajuda="Mínimo de 6 caracteres." editable={!cadastrando} />
      {aviso && <Texto tamanho={13} cor={aviso.ok ? 'statusEntregue' : 'feedbackErro'} accessibilityRole={aviso.ok ? undefined : 'alert'}>{aviso.texto}</Texto>}
      <Botao rotulo={cadastrando ? 'Cadastrando…' : 'Cadastrar usuário'} icone="mais" variante="primario" disabled={cadastrando} onPress={cadastrar} />
    </Cartao>
  );

  return <Colunas emColunas={emColunas} principal={principal} lateral={lateral} />;
}
