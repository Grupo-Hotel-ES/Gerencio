import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AuthLayout } from '@/components/auth/auth-layout';
import { Botao, Cartao, Texto } from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';

export default function RedefinirSenha() {
  const cores = useCores();
  const [novaSenha, setNovaSenha] = useState('••••••••••••');
  const [confirmarSenha, setConfirmarSenha] = useState('••••••••••••');
  const [sucesso, setSucesso] = useState(false);

  const estiloInput = [
    styles.input,
    { borderColor: cores.borda, backgroundColor: cores.fundo, color: cores.textoPrincipal },
  ];

  return (
    <AuthLayout>
      <View style={styles.cabecalho}>
        <Texto accessibilityRole="header" tamanho={32} peso={700}>
          Uma nova senha, com segurança
        </Texto>
        <Texto tamanho={16} cor="textoSecundario">
          Crie uma senha diferente da anterior para proteger seu acesso.
        </Texto>
      </View>

      <View style={styles.formulario}>
        <View style={styles.campo}>
          <Texto tamanho={13} peso={500} style={styles.label}>
            Nova senha
          </Texto>
          <TextInput
            value={novaSenha}
            onChangeText={setNovaSenha}
            secureTextEntry
            style={estiloInput}
          />
        </View>

        <View style={styles.campo}>
          <Texto tamanho={13} peso={500} style={styles.label}>
            Confirmar nova senha
          </Texto>
          <TextInput
            value={confirmarSenha}
            onChangeText={setConfirmarSenha}
            secureTextEntry
            style={estiloInput}
          />
          <Texto tamanho={12} cor="textoSecundario">
            As duas senhas precisam ser iguais.
          </Texto>
        </View>

        <Cartao style={styles.cardRequisitos}>
          <Texto tamanho={14} peso={600}>
            Requisitos da senha
          </Texto>
          <View style={styles.linhaRequisito}>
            <Texto cor="statusEntregue">✓</Texto>
            <Texto tamanho={13} cor="textoSecundario">
              Pelo menos 8 caracteres
            </Texto>
          </View>
          <View style={styles.linhaRequisito}>
            <Texto cor="statusEntregue">✓</Texto>
            <Texto tamanho={13} cor="textoSecundario">
              Uma letra maiúscula e uma minúscula
            </Texto>
          </View>
          <View style={styles.linhaRequisito}>
            <Texto cor="statusEntregue">✓</Texto>
            <Texto tamanho={13} cor="textoSecundario">
              Pelo menos um número
            </Texto>
          </View>
          <Texto tamanho={12} cor="textoSecundario" style={{ marginTop: Espacamento.xsmall }}>
            Evite seu nome, e-mail e senhas usadas em outros serviços.
          </Texto>
        </Cartao>

        <Botao
          rotulo="Salvar nova senha"
          variante="primario"
          onPress={() => setSucesso(true)}
        />

        {sucesso && (
          <Cartao style={[styles.cardSucesso, { borderColor: cores.statusEntregue }]}>
            <Texto tamanho={16} peso={600}>
              ✓ Senha redefinida com sucesso
            </Texto>
            <Texto tamanho={13} cor="textoSecundario">
              Sua nova senha foi salva. Entre novamente para continuar sua operação.
            </Texto>
          </Cartao>
        )}

        <Link href="/login" asChild>
          <Botao rotulo="Ir para o login" />
        </Link>

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
  cardRequisitos: {
    gap: Espacamento.small,
  },
  linhaRequisito: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
  },
  cardSucesso: {
    gap: Espacamento.xsmall,
    borderWidth: 1,
  },
  rodape: {
    gap: Espacamento.xsmall,
    paddingTop: Espacamento.medium,
    alignItems: 'center',
  },
});

