import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AuthLayout } from '@/components/auth/auth-layout';
import { Aviso, Botao, Divisor, Texto } from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';

export default function Login() {
  const cores = useCores();
  const [email, setEmail] = useState('marina@vilabistro.com.br');
  const [senha, setSenha] = useState('••••••••••••');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(true);

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
          Entre para acompanhar o Vila Bistrô.
        </Texto>
      </View>

      <View style={styles.formulario}>
        <View style={styles.campo}>
          <Texto tamanho={13} peso={500} style={styles.label}>
            E-mail
          </Texto>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            style={estiloInput}
          />
        </View>

        <View style={styles.campo}>
          <Texto tamanho={13} peso={500} style={styles.label}>
            Senha
          </Texto>
          <View style={styles.inputSenhaContainer}>
            <TextInput
              value={senha}
              onChangeText={setSenha}
              secureTextEntry={!mostrarSenha}
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

          <Link href="/recuperar-senha" asChild>
            <Pressable>
              <Texto tamanho={13} peso={600} cor="brand">
                Esqueci minha senha
              </Texto>
            </Pressable>
          </Link>
        </View>

        <Botao
          rotulo="Entrar"
          variante="primario"
          onPress={() => router.replace('/')}
        />

        <Aviso
          icone="escudo"
          titulo="Seu acesso é pessoal"
          texto="Não compartilhe sua senha. Convide sua equipe em Usuários e permissões."
        />

        <Divisor />

        <View style={styles.secaoCadastro}>
          <Texto tamanho={14} peso={500}>
            Ainda não tem uma conta?
          </Texto>
          <Link href="/cadastro" asChild>
            <Botao rotulo="Cadastrar meu estabelecimento" />
          </Link>
        </View>

        <View style={styles.rodape}>
          <Texto tamanho={13} cor="textoSecundario">
            Precisa de ajuda? Fale com o suporte.
          </Texto>
          <Texto tamanho={13} cor="textoSecundario">
            Privacidade • Termos de uso
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
  secaoCadastro: {
    gap: Espacamento.medium,
  },
  rodape: {
    gap: Espacamento.xsmall,
    paddingTop: Espacamento.medium,
  },
});

