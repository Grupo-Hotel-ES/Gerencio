import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AuthLayout } from '@/components/auth/auth-layout';
import { Botao, Texto } from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';

export default function Cadastro() {
  const cores = useCores();

  // Dados do estabelecimento
  const [nome, setNome] = useState('Vila Bistrô');
  const [cnpj, setCnpj] = useState('12.345.678/0001-90');
  const [tipo, setTipo] = useState('Restaurante');
  const [telefone, setTelefone] = useState('(11) 3456-7890');

  // Responsável
  const [nomeResp, setNomeResp] = useState('Marina Almeida');
  const [celular, setCelular] = useState('(11) 99999-1234');
  const [email, setEmail] = useState('marina@vilabistro.com.br');
  const [senha, setSenha] = useState('••••••••••••');
  const [confirmarSenha, setConfirmarSenha] = useState('••••••••••••');
  const [termos, setTermos] = useState(true);
  const [novidades, setNovidades] = useState(false);

  const estiloInput = [
    styles.input,
    { borderColor: cores.borda, backgroundColor: cores.fundo, color: cores.textoPrincipal },
  ];

  return (
    <AuthLayout>
      <View style={styles.cabecalho}>
        <Texto accessibilityRole="header" tamanho={32} peso={700}>
          Vamos conhecer sua cozinha
        </Texto>
        <Texto tamanho={16} cor="textoSecundario">
          Cadastre o estabelecimento e quem será responsável pela conta.
        </Texto>
        <Texto tamanho={13} peso={600} cor="brand" style={{ marginTop: Espacamento.small }}>
          1. Cadastro → 2. Integrações → 3. Pronto
        </Texto>
      </View>

      <View style={styles.formulario}>
        <Texto tamanho={18} peso={600}>
          Dados do estabelecimento
        </Texto>

        <View style={styles.campo}>
          <Texto tamanho={13} peso={500} style={styles.label}>
            Nome do estabelecimento *
          </Texto>
          <TextInput value={nome} onChangeText={setNome} style={estiloInput} />
        </View>

        <View style={styles.linhaDupla}>
          <View style={styles.campoFlex}>
            <Texto tamanho={13} peso={500} style={styles.label}>
              CNPJ *
            </Texto>
            <TextInput value={cnpj} onChangeText={setCnpj} style={estiloInput} />
          </View>
          <View style={styles.campoFlex}>
            <Texto tamanho={13} peso={500} style={styles.label}>
              Tipo de estabelecimento *
            </Texto>
            <TextInput value={tipo} onChangeText={setTipo} style={estiloInput} />
          </View>
        </View>

        <View style={styles.campo}>
          <Texto tamanho={13} peso={500} style={styles.label}>
            Telefone do estabelecimento *
          </Texto>
          <TextInput value={telefone} onChangeText={setTelefone} style={estiloInput} />
        </View>

        <Texto tamanho={18} peso={600} style={{ marginTop: Espacamento.medium }}>
          Responsável pelo acesso
        </Texto>

        <View style={styles.linhaDupla}>
          <View style={styles.campoFlex}>
            <Texto tamanho={13} peso={500} style={styles.label}>
              Nome completo *
            </Texto>
            <TextInput value={nomeResp} onChangeText={setNomeResp} style={estiloInput} />
          </View>
          <View style={styles.campoFlex}>
            <Texto tamanho={13} peso={500} style={styles.label}>
              Celular *
            </Texto>
            <TextInput value={celular} onChangeText={setCelular} style={estiloInput} />
          </View>
        </View>

        <View style={styles.campo}>
          <Texto tamanho={13} peso={500} style={styles.label}>
            E-mail do responsável *
          </Texto>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            style={estiloInput}
          />
          <Texto tamanho={12} cor="textoSecundario">
            Você usará este e-mail para entrar e recuperar seu acesso.
          </Texto>
        </View>

        <View style={styles.linhaDupla}>
          <View style={styles.campoFlex}>
            <Texto tamanho={13} peso={500} style={styles.label}>
              Senha *
            </Texto>
            <TextInput
              value={senha}
              onChangeText={setSenha}
              secureTextEntry
              style={estiloInput}
            />
          </View>
          <View style={styles.campoFlex}>
            <Texto tamanho={13} peso={500} style={styles.label}>
              Confirmar senha *
            </Texto>
            <TextInput
              value={confirmarSenha}
              onChangeText={setConfirmarSenha}
              secureTextEntry
              style={estiloInput}
            />
          </View>
        </View>
        <Texto tamanho={12} cor="textoSecundario">
          Use pelo menos 8 caracteres, com uma letra maiúscula, uma minúscula e um número.
        </Texto>

        <View style={styles.secaoCheckboxes}>
          <Pressable onPress={() => setTermos((v) => !v)} style={styles.checkboxLinha}>
            <View
              style={[
                styles.checkbox,
                { borderColor: cores.borda },
                termos && { backgroundColor: cores.brand, borderColor: cores.brand },
              ]}>
              {termos && <Texto tamanho={11} peso={700} cor="textOnBrand">✓</Texto>}
            </View>
            <Texto tamanho={13} cor="textoSecundario" style={{ flex: 1 }}>
              Li e aceito os Termos de uso e a Política de privacidade.
            </Texto>
          </Pressable>

          <Pressable onPress={() => setNovidades((v) => !v)} style={styles.checkboxLinha}>
            <View
              style={[
                styles.checkbox,
                { borderColor: cores.borda },
                novidades && { backgroundColor: cores.brand, borderColor: cores.brand },
              ]}>
              {novidades && <Texto tamanho={11} peso={700} cor="textOnBrand">✓</Texto>}
            </View>
            <Texto tamanho={13} cor="textoSecundario" style={{ flex: 1 }}>
              Quero receber novidades e dicas por e-mail (opcional).
            </Texto>
          </Pressable>
        </View>

        <Texto tamanho={12} cor="textoSecundario">
          * Campos obrigatórios • Dados ilustrativos
        </Texto>

        <Botao
          rotulo="Criar conta e continuar"
          variante="primario"
          onPress={() => router.replace('/')}
        />

        <View style={styles.linhaLogin}>
          <Texto tamanho={14} cor="textoSecundario">
            Já tem uma conta?
          </Texto>
          <Link href="/login" asChild>
            <Pressable>
              <Texto tamanho={14} peso={600} cor="brand">
                Entrar
              </Texto>
            </Pressable>
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
    gap: Espacamento.medium,
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
  linhaDupla: {
    flexDirection: 'row',
    gap: Espacamento.medium,
  },
  campoFlex: {
    flex: 1,
    gap: Espacamento.xsmall,
  },
  secaoCheckboxes: {
    gap: Espacamento.small,
    marginVertical: Espacamento.xsmall,
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
  linhaLogin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Espacamento.xsmall,
    paddingTop: Espacamento.small,
  },
  rodape: {
    gap: Espacamento.xsmall,
    paddingTop: Espacamento.medium,
    alignItems: 'center',
  },
});

