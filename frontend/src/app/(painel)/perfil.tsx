import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import { Botao, Cartao, Etiqueta, Icone, Texto } from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import { obterIniciais, usePerfil, type DadosPerfil } from '@/data/perfil-context';
import { useCores } from '@/hooks/use-cores';

export default function Perfil() {
  const cores = useCores();
  const larguraConteudo = useLarguraConteudo();
  const emColunas = larguraConteudo >= 980;

  const { perfil, salvarPerfil } = usePerfil();

  // Estado local do formulário para permitir edição antes de salvar
  const [form, setForm] = useState<DadosPerfil>(perfil);
  const [salvoComSucesso, setSalvoComSucesso] = useState(false);

  const atualizarCampo = (campo: keyof DadosPerfil, valor: string | boolean) => {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setSalvoComSucesso(false);
  };

  const handleSalvar = () => {
    salvarPerfil(form);
    setSalvoComSucesso(true);
    setTimeout(() => setSalvoComSucesso(false), 3000);
  };

  const handleCancelar = () => {
    setForm(perfil);
    setSalvoComSucesso(false);
  };

  const estiloCampo = [
    styles.input,
    { borderColor: cores.borda, backgroundColor: cores.fundo, color: cores.textoPrincipal },
  ];

  const iniciaisAtuais = obterIniciais(form.nomeCompleto);

  return (
    <Pagina
      titulo="Perfil"
      subtitulo="Gerencie seus dados pessoais e as informações do seu restaurante."
      acao={
        <Botao
          rotulo="Editar perfil"
          icone="editar"
          onPress={() => {}}
        />
      }>
      {/* Breadcrumb discreto */}
      <View style={styles.breadcrumb}>
        <Texto tamanho={13} cor="textoSecundario">
          Configurações / Perfil
        </Texto>
      </View>

      <View style={[styles.colunas, !emColunas && styles.empilhado]}>
        {/* Formulário Principal */}
        <View style={styles.colunaPrincipal}>
          {/* Card 1: Dados pessoais */}
          <Cartao style={styles.cartaoForm}>
            <Texto accessibilityRole="header" tamanho={18} peso={600}>
              Dados pessoais
            </Texto>
            <Texto tamanho={13} cor="textoSecundario">
              {`Informações da responsável pelo ${form.nomeRestaurante}.`}
            </Texto>

            <View style={styles.linhaDupla}>
              <View style={styles.campoFlex}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Nome completo *
                </Texto>
                <TextInput
                  value={form.nomeCompleto}
                  onChangeText={(t) => atualizarCampo('nomeCompleto', t)}
                  style={estiloCampo}
                />
              </View>

              <View style={styles.campoFlex}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Telefone celular *
                </Texto>
                <TextInput
                  value={form.telefoneCelular}
                  onChangeText={(t) => atualizarCampo('telefoneCelular', t)}
                  style={estiloCampo}
                />
              </View>
            </View>

            <View style={styles.linhaDupla}>
              <View style={styles.campoFlex}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  E-mail de acesso *
                </Texto>
                <TextInput
                  value={form.emailAcesso}
                  onChangeText={(t) => atualizarCampo('emailAcesso', t)}
                  style={estiloCampo}
                />
                <Texto tamanho={12} cor="textoSecundario" style={{ marginTop: 4 }}>
                  O e-mail informado é utilizado para acessar sua conta.
                </Texto>
              </View>

              <View style={styles.campoFlex}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Cargo / função
                </Texto>
                <TextInput
                  value={form.cargo}
                  onChangeText={(t) => atualizarCampo('cargo', t)}
                  style={estiloCampo}
                />
              </View>
            </View>
          </Cartao>

          {/* Card 2: Dados do restaurante */}
          <Cartao style={styles.cartaoForm}>
            <Texto accessibilityRole="header" tamanho={18} peso={600}>
              Dados do restaurante
            </Texto>
            <Texto tamanho={13} cor="textoSecundario">
              Identificação e canais de contato do seu restaurante.
            </Texto>

            <View style={styles.linhaDupla}>
              <View style={styles.campoFlex}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Nome do restaurante *
                </Texto>
                <TextInput
                  value={form.nomeRestaurante}
                  onChangeText={(t) => atualizarCampo('nomeRestaurante', t)}
                  style={estiloCampo}
                />
              </View>

              <View style={styles.campoFlex}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Razão social *
                </Texto>
                <TextInput
                  value={form.razaoSocial}
                  onChangeText={(t) => atualizarCampo('razaoSocial', t)}
                  style={estiloCampo}
                />
              </View>
            </View>

            <View style={styles.linhaDupla}>
              <View style={styles.campoFlex}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  CNPJ *
                </Texto>
                <TextInput
                  value={form.cnpj}
                  onChangeText={(t) => atualizarCampo('cnpj', t)}
                  style={estiloCampo}
                />
              </View>

              <View style={styles.campoFlex}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Categoria
                </Texto>
                <TextInput
                  value={form.categoria}
                  onChangeText={(t) => atualizarCampo('categoria', t)}
                  style={estiloCampo}
                />
              </View>
            </View>

            <View style={styles.linhaDupla}>
              <View style={styles.campoFlex}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Telefone
                </Texto>
                <TextInput
                  value={form.telefoneRestaurante}
                  onChangeText={(t) => atualizarCampo('telefoneRestaurante', t)}
                  style={estiloCampo}
                />
              </View>

              <View style={styles.campoFlex}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  E-mail de contato
                </Texto>
                <TextInput
                  value={form.emailContato}
                  onChangeText={(t) => atualizarCampo('emailContato', t)}
                  style={estiloCampo}
                />
              </View>
            </View>
          </Cartao>

          {/* Card 3: Endereço do restaurante */}
          <Cartao style={styles.cartaoForm}>
            <Texto accessibilityRole="header" tamanho={18} peso={600}>
              Endereço do restaurante
            </Texto>
            <Texto tamanho={13} cor="textoSecundario">
              Endereço da cozinha e ponto de retirada.
            </Texto>

            <View style={styles.linhaDupla}>
              <View style={styles.campoFlex}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  CEP *
                </Texto>
                <TextInput
                  value={form.cep}
                  onChangeText={(t) => atualizarCampo('cep', t)}
                  style={estiloCampo}
                />
              </View>

              <View style={styles.campoFlex}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Cidade / UF *
                </Texto>
                <TextInput
                  value={form.cidadeUf}
                  onChangeText={(t) => atualizarCampo('cidadeUf', t)}
                  style={estiloCampo}
                />
              </View>
            </View>

            <View>
              <Texto tamanho={13} peso={500} style={styles.label}>
                Logradouro *
              </Texto>
              <TextInput
                value={form.logradouro}
                onChangeText={(t) => atualizarCampo('logradouro', t)}
                style={estiloCampo}
              />
            </View>

            <View style={styles.linhaTripla}>
              <View style={{ flex: 1 }}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Número *
                </Texto>
                <TextInput
                  value={form.numero}
                  onChangeText={(t) => atualizarCampo('numero', t)}
                  style={estiloCampo}
                />
              </View>

              <View style={{ flex: 1.5 }}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Complemento
                </Texto>
                <TextInput
                  value={form.complemento}
                  onChangeText={(t) => atualizarCampo('complemento', t)}
                  style={estiloCampo}
                />
              </View>

              <View style={{ flex: 1.5 }}>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Bairro *
                </Texto>
                <TextInput
                  value={form.bairro}
                  onChangeText={(t) => atualizarCampo('bairro', t)}
                  style={estiloCampo}
                />
              </View>
            </View>
          </Cartao>

          {/* Rodapé de Ações */}
          <View style={styles.rodapeAcoes}>
            <View>
              <Texto tamanho={13} cor="textoSecundario">
                * Campos obrigatórios
              </Texto>
              <Texto tamanho={13} cor="textoSecundario">
                {salvoComSucesso
                  ? '✓ Alterações salvas com sucesso!'
                  : 'Revise seus dados e os do restaurante antes de salvar.'}
              </Texto>
            </View>

            <View style={styles.linhaBotoes}>
              <Botao rotulo="Cancelar" onPress={handleCancelar} />
              <Botao
                rotulo="Salvar alterações"
                icone="salvar"
                variante="primario"
                onPress={handleSalvar}
              />
            </View>
          </View>
        </View>

        {/* Coluna Lateral */}
        <View style={styles.colunaLateral}>
          {/* Card: Seu perfil */}
          <Cartao style={styles.cartaoLateral}>
            <Texto accessibilityRole="header" tamanho={18} peso={600}>
              Seu perfil
            </Texto>

            <View style={styles.blocoIdentificacao}>
              <View style={[styles.avatarGrande, { backgroundColor: cores.brand }]}>
                <Texto tamanho={24} peso={700} cor="textOnBrand">
                  {iniciaisAtuais}
                </Texto>
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <Texto tamanho={18} peso={600}>
                  {form.nomeCompleto}
                </Texto>
                <Texto tamanho={13} cor="textoSecundario">
                  {form.cargo}
                </Texto>
              </View>
            </View>

            <View style={styles.blocoLoja}>
              <Texto tamanho={16} peso={500}>
                {form.nomeRestaurante}
              </Texto>
              <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                <Etiqueta
                  rotulo={form.lojaAberta ? 'Loja aberta' : 'Loja fechada'}
                  corPonto={form.lojaAberta ? cores.statusEntregue : cores.statusCancelado}
                />
              </View>
            </View>

            <Texto tamanho={13} cor="textoSecundario" style={{ lineHeight: 18 }}>
              Você pode editar seus dados e as informações do restaurante nesta página.
            </Texto>
          </Cartao>

          {/* Card: Acesso à conta */}
          <Cartao style={styles.cartaoLateral}>
            <Texto accessibilityRole="header" tamanho={18} peso={600}>
              Acesso à conta
            </Texto>

            <Texto peso={600}>
              Administradora do restaurante
            </Texto>

            <Texto tamanho={13} cor="textoSecundario" style={{ lineHeight: 18 }}>
              Seu acesso permite gerenciar os dados do Vila Bistrô e acompanhar a operação.
            </Texto>

            <Texto tamanho={13} cor="textoSecundario" style={{ lineHeight: 18 }}>
              Para gerenciar a equipe e os acessos, abra Usuários e permissões.
            </Texto>

            <Link href="/configuracoes" asChild>
              <Botao rotulo="Usuários e permissões" />
            </Link>
          </Cartao>
        </View>
      </View>
    </Pagina>
  );
}

const styles = StyleSheet.create({
  breadcrumb: {
    marginBottom: -Espacamento.small,
  },
  colunas: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Espacamento.large,
  },
  empilhado: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  colunaPrincipal: {
    flex: 1,
    gap: Espacamento.large,
  },
  colunaLateral: {
    width: 320,
    gap: Espacamento.large,
  },
  cartaoForm: {
    gap: Espacamento.large,
  },
  cartaoLateral: {
    gap: Espacamento.medium,
  },
  label: {
    marginBottom: Espacamento.xsmall,
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
  linhaTripla: {
    flexDirection: 'row',
    gap: Espacamento.medium,
  },
  campoFlex: {
    flex: 1,
  },
  rodapeAcoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
    paddingVertical: Espacamento.small,
  },
  linhaBotoes: {
    flexDirection: 'row',
    gap: Espacamento.medium,
  },
  blocoIdentificacao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.medium,
    paddingVertical: Espacamento.small,
  },
  avatarGrande: {
    width: 56,
    height: 56,
    borderRadius: Raio.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blocoLoja: {
    paddingVertical: Espacamento.xsmall,
  },
});

