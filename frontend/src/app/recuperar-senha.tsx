import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AuthLayout } from '@/components/auth/auth-layout';
import { Aviso, Botao, Cartao, Texto } from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';

export default function RecuperarSenha() {
  const cores = useCores();
  const [email, setEmail] = useState('marina@vilabistro.com.br');
  const [enviado, setEnviado] = useState(false);

  const estiloInput = [
    styles.input,
    { borderColor: cores.borda, backgroundColor: cores.fundo, color: cores.textoPrincipal },
  ];

  return (
    <AuthLayout>
      <View style={styles.cabecalho}>
        <Texto accessibilityRole="header" tamanho={32} peso={700}>
          Vamos recuperar seu acesso
        </Texto>
        <Texto tamanho={16} cor="textoSecundario">
          Enviaremos as orientações de forma segura, sem expor os dados da sua conta.
        </Texto>
      </View>

      <View style={styles.formulario}>
        <View style={styles.campo}>
          <Texto tamanho={13} peso={500} style={styles.label}>
            E-mail de acesso
          </Texto>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            style={estiloInput}
          />
          <Texto tamanho={12} cor="textoSecundario">
            Informe o e-mail usado no cadastro.
          </Texto>
        </View>

        <Botao
          rotulo={enviado ? 'Instruções enviadas' : 'Enviar instruções'}
          variante="primario"
          onPress={() => setEnviado(true)}
        />

        {enviado && (
          <Cartao style={[styles.cardSucesso, { backgroundColor: cores.fundo2 }]}>
            <Texto tamanho={16} peso={600}>
              Solicitação recebida
            </Texto>
            <Texto tamanho={14} cor="textoSecundario" style={{ lineHeight: 20 }}>
              Se houver uma conta associada a este e-mail, você receberá instruções para redefinir sua senha.
            </Texto>
            <Texto tamanho={12} cor="textoSecundario">
              Por segurança, não confirmamos se o e-mail está cadastrado. Confira também a pasta de spam.
            </Texto>
          </Cartao>
        )}

        <Aviso
          icone="escudo"
          titulo="Aguarde antes de solicitar novamente"
          texto="Você poderá fazer uma nova solicitação em 60 segundos. Use apenas o link mais recente recebido."
        />

        <Link href="/login" asChild>
          <Botao rotulo="Voltar para o login" />
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
  cardSucesso: {
    gap: Espacamento.small,
  },
  rodape: {
    gap: Espacamento.xsmall,
    paddingTop: Espacamento.medium,
    alignItems: 'center',
  },
});

