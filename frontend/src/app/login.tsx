import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AuthLayout } from '@/components/auth/auth-layout';
import { Aviso, Botao, Divisor, Texto } from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import { useSessao } from '@/data/sessao';
import { useCores } from '@/hooks/use-cores';
import { buscarMarca } from '@/services/api-conta';

export default function Login() {
  const cores = useCores();
  const { carregando, usuario, entrar } = useSessao();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nomeRestaurante, setNomeRestaurante] = useState<string | null>(null);

  useEffect(() => {
    buscarMarca().then((marca) => setNomeRestaurante(marca.nome)).catch(() => {});
  }, []);

  if (!carregando && usuario) return <Redirect href="/" />;

  const enviar = async () => {
    if (!login.trim() || !senha) { setErro('Informe usuário e senha.'); return; }
    setEntrando(true); setErro(null);
    try {
      await entrar(login.trim(), senha, lembrar);
      router.replace('/');
    } catch (e) {
      setErro((e as Error).message);
      setEntrando(false);
    }
  };

  const estiloInput = [
    styles.input,
    { borderColor: cores.borda, backgroundColor: cores.fundo, color: cores.textoPrincipal },
  ];

  return (
    <AuthLayout>
      <View style={styles.cabecalho}>
        <Texto accessibilityRole="header" tamanho={32} peso={700}>
          Bom ter você de volta
        </Texto>
        <Texto tamanho={16} cor="textoSecundario">
          {nomeRestaurante ? `Entre para acompanhar o ${nomeRestaurante}.` : 'Entre para acompanhar o seu restaurante.'}
        </Texto>
      </View>

      <View style={styles.formulario}>
        <View style={styles.campo}>
          <Texto tamanho={13} peso={500} style={styles.label}>
            Usuário
          </Texto>
          <TextInput
            accessibilityLabel="Usuário"
            value={login}
            onChangeText={setLogin}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            placeholder="seu.usuario"
            placeholderTextColor={cores.textoSecundario}
            editable={!entrando}
            style={estiloInput}
          />
        </View>

        <View style={styles.campo}>
          <Texto tamanho={13} peso={500} style={styles.label}>
            Senha
          </Texto>
          <View style={styles.inputSenhaContainer}>
            <TextInput
              accessibilityLabel="Senha"
              value={senha}
              onChangeText={setSenha}
              secureTextEntry={!mostrarSenha}
              autoComplete="current-password"
              editable={!entrando}
              onSubmitEditing={enviar}
              style={[estiloInput, styles.inputSenha]}
            />
            <Pressable
              onPress={() => setMostrarSenha((v) => !v)}
              style={styles.botaoOlho}>
              <Texto tamanho={13} cor="textoSecundario">
                {mostrarSenha ? 'Ocultar' : 'Ver'}
              </Texto>
            </Pressable>
          </View>
        </View>

        <View style={styles.linhaOpcoes}>
          <Pressable
            onPress={() => setLembrar((v) => !v)}
            style={styles.checkboxLinha}>
            <View
              style={[
                styles.checkbox,
                { borderColor: cores.borda },
                lembrar && { backgroundColor: cores.brand, borderColor: cores.brand },
              ]}>
              {lembrar && <Texto tamanho={11} peso={700} cor="textOnBrand">✓</Texto>}
            </View>
            <Texto tamanho={13} cor="textoSecundario">
              Manter conectado neste dispositivo
            </Texto>
          </Pressable>

        </View>

        {erro && <Texto cor="feedbackErro" accessibilityRole="alert">{erro}</Texto>}

        <Botao
          rotulo={entrando ? 'Entrando…' : 'Entrar'}
          variante="primario"
          disabled={entrando || carregando}
          onPress={enviar}
        />

        <Aviso
          icone="escudo"
          titulo="Seu acesso é pessoal"
          texto="Não compartilhe sua senha. O administrador cadastra a equipe em Configurações > Usuários e permissões."
        />

        <Divisor />

        <View style={styles.rodape}>
          <Texto tamanho={13} cor="textoSecundario">
            Esqueceu a senha? Peça ao administrador para definir uma nova.
          </Texto>
        </View>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  cabecalho: {
    gap: Espacamento.xsmall,
  },
  formulario: {
    gap: Espacamento.large,
  },
  campo: {
    gap: Espacamento.xsmall,
  },
  label: {
    marginBottom: 2,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: Raio.small,
    paddingHorizontal: Espacamento.medium,
    fontFamily: Fonts?.sans,
    fontSize: 14,
  },
  inputSenhaContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputSenha: {
    paddingRight: 60,
  },
  botaoOlho: {
    position: 'absolute',
    right: Espacamento.medium,
    height: 44,
    justifyContent: 'center',
  },
  linhaOpcoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.small,
  },
  checkboxLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rodape: {
    gap: Espacamento.xsmall,
    paddingTop: Espacamento.medium,
  },
});

