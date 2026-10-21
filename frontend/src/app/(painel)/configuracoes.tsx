import { useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import { Aviso, Botao, Cartao, Chip, Divisor, Etiqueta, Icone, Texto } from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';

type AbaConfiguracao = 'estabelecimento' | 'usuarios' | 'integracoes' | 'preferencias';

const ABAS: { id: AbaConfiguracao; rotulo: string }[] = [
  { id: 'estabelecimento', rotulo: 'Estabelecimento' },
  { id: 'usuarios', rotulo: 'Usuários e permissões' },
  { id: 'integracoes', rotulo: 'Integrações' },
  { id: 'preferencias', rotulo: 'Preferências' },
];

const CANAIS_INTEGRACOES = [
  { nome: 'WhatsApp', conectado: true, sync: '11 out., 12:38' },
  { nome: 'iFood', conectado: true, sync: '11 out., 12:38' },
  { nome: '99 Food', conectado: true, sync: '11 out., 12:38' },
  { nome: 'Uber Eats', conectado: true, sync: '11 out., 12:38' },
  { nome: 'Rappi', conectado: true, sync: '11 out., 12:38' },
  { nome: 'Keeta', conectado: true, sync: '11 out., 12:38' },
];

export default function Configuracoes() {
  const cores = useCores();
  const larguraConteudo = useLarguraConteudo();
  const emColunas = larguraConteudo >= 980;

  const [abaAtiva, setAbaAtiva] = useState<AbaConfiguracao>('estabelecimento');

  // Estado da aba Estabelecimento
  const [nomeEstabelecimento, setNomeEstabelecimento] = useState('Vila Bistrô');
  const [razaoSocial, setRazaoSocial] = useState('Vila Bistrô Alimentação Ltda.');
  const [cnpj, setCnpj] = useState('12.345.678/0001-90');
  const [categoria, setCategoria] = useState('Restaurante');
  const [telefone, setTelefone] = useState('(11) 3456-7890');
  const [emailContato, setEmailContato] = useState('contato@vilabistro.com.br');
  const [cep, setCep] = useState('01001-000');
  const [cidadeUf, setCidadeUf] = useState('São Paulo / SP');
  const [logradouro, setLogradouro] = useState('Rua das Palmeiras');
  const [numero, setNumero] = useState('120');
  const [complemento, setComplemento] = useState('Loja 2');
  const [bairro, setBairro] = useState('Centro');
  const [fusoHorario, setFusoHorario] = useState('Brasília (GMT-3)');
  const [diasFuncionamento, setDiasFuncionamento] = useState('Segunda a sábado');
  const [abertura, setAbertura] = useState('11:00');
  const [fechamento, setFechamento] = useState('22:00');
  const [entregaPropria, setEntregaPropria] = useState(true);
  const [retiradaLocal, setRetiradaLocal] = useState(true);

  // Estado da aba Usuários
  const [buscaUsuario, setBuscaUsuario] = useState('');
  const [novoNome, setNovoNome] = useState('Beatriz Rocha');
  const [novoEmail, setNovoEmail] = useState('beatriz@vilabistro.com.br');
  const [funcaoSelecionada, setFuncaoSelecionada] = useState('Operadora');

  // Estado da aba Preferências
  const [baixaAutomatica, setBaixaAutomatica] = useState(true);
  const [indisponivelZero, setIndisponivelZero] = useState(true);
  const [alertasEstoqueBaixo, setAlertasEstoqueBaixo] = useState(true);
  const [limiteAlerta, setLimiteAlerta] = useState('5 unidades');
  const [unidadePadrao, setUnidadePadrao] = useState('Unidade (un.)');
  const [notifNovosPedidos, setNotifNovosPedidos] = useState(true);
  const [notifFalhasSync, setNotifFalhasSync] = useState(true);
  const [notifEstoqueBaixo, setNotifEstoqueBaixo] = useState(true);
  const [notifSom, setNotifSom] = useState(true);
  const [notifResumoDiario, setNotifResumoDiario] = useState(false);
  const [emailAvisos, setEmailAvisos] = useState('marina@vilabistro.com.br');

  const estiloCampo = [
    styles.input,
    { borderColor: cores.borda, backgroundColor: cores.fundo, color: cores.textoPrincipal },
  ];

  const tituloSubtitulo: Record<AbaConfiguracao, { titulo: string; subtitulo: string }> = {
    estabelecimento: {
      titulo: 'Estabelecimento',
      subtitulo: 'Mantenha os dados da sua cozinha e da operação atualizados.',
    },
    usuarios: {
      titulo: 'Usuários e permissões',
      subtitulo: 'Defina quem participa da operação e o que cada pessoa pode fazer.',
    },
    integracoes: {
      titulo: 'Integrações',
      subtitulo: 'Revise as conexões e acompanhe a sincronização do estoque com seus canais.',
    },
    preferencias: {
      titulo: 'Preferências',
      subtitulo: 'Ajuste o comportamento do estoque e os avisos da sua operação.',
    },
  };

  return (
    <Pagina
      titulo={tituloSubtitulo[abaAtiva].titulo}
      subtitulo={tituloSubtitulo[abaAtiva].subtitulo}>
      {/* Abas */}
      <View style={styles.abas}>
        {ABAS.map(({ id, rotulo }) => (
          <Chip
            key={id}
            rotulo={rotulo}
            ativo={abaAtiva === id}
            onPress={() => setAbaAtiva(id)}
          />
        ))}
      </View>

      {/* ABA 1: ESTABELECIMENTO */}
      {abaAtiva === 'estabelecimento' && (
        <View style={[styles.layoutColunas, !emColunas && styles.layoutEmpilhado]}>
          <View style={styles.colunaPrincipal}>
            <Cartao style={styles.cartaoForm}>
              <Texto accessibilityRole="header" tamanho={18} peso={600}>
                Dados do estabelecimento
              </Texto>
              <Texto tamanho={13} cor="textoSecundario">
                Informações de identificação e contato do Vila Bistrô.
              </Texto>

              <View style={styles.linhaDupla}>
                <View style={styles.campoFlex}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    Nome do estabelecimento *
                  </Texto>
                  <TextInput
                    value={nomeEstabelecimento}
                    onChangeText={setNomeEstabelecimento}
                    style={estiloCampo}
                  />
                </View>
                <View style={styles.campoFlex}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    Razão social *
                  </Texto>
                  <TextInput
                    value={razaoSocial}
                    onChangeText={setRazaoSocial}
                    style={estiloCampo}
                  />
                </View>
              </View>

              <View style={styles.linhaDupla}>
                <View style={styles.campoFlex}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    CNPJ *
                  </Texto>
                  <TextInput value={cnpj} onChangeText={setCnpj} style={estiloCampo} />
                </View>
                <View style={styles.campoFlex}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    Categoria
                  </Texto>
                  <TextInput
                    value={categoria}
                    onChangeText={setCategoria}
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
                    value={telefone}
                    onChangeText={setTelefone}
                    style={estiloCampo}
                  />
                </View>
                <View style={styles.campoFlex}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    E-mail de contato
                  </Texto>
                  <TextInput
                    value={emailContato}
                    onChangeText={setEmailContato}
                    style={estiloCampo}
                  />
                </View>
              </View>
            </Cartao>

            <Cartao style={styles.cartaoForm}>
              <Texto accessibilityRole="header" tamanho={18} peso={600}>
                Endereço
              </Texto>
              <Texto tamanho={13} cor="textoSecundario">
                Endereço da cozinha e ponto de retirada.
              </Texto>

              <View style={styles.linhaDupla}>
                <View style={styles.campoFlex}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    CEP *
                  </Texto>
                  <TextInput value={cep} onChangeText={setCep} style={estiloCampo} />
                </View>
                <View style={styles.campoFlex}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    Cidade / UF *
                  </Texto>
                  <TextInput
                    value={cidadeUf}
                    onChangeText={setCidadeUf}
                    style={estiloCampo}
                  />
                </View>
              </View>

              <View>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Logradouro *
                </Texto>
                <TextInput
                  value={logradouro}
                  onChangeText={setLogradouro}
                  style={estiloCampo}
                />
              </View>

              <View style={styles.linhaTripla}>
                <View style={{ flex: 1 }}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    Número *
                  </Texto>
                  <TextInput
                    value={numero}
                    onChangeText={setNumero}
                    style={estiloCampo}
                  />
                </View>
                <View style={{ flex: 1.5 }}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    Complemento
                  </Texto>
                  <TextInput
                    value={complemento}
                    onChangeText={setComplemento}
                    style={estiloCampo}
                  />
                </View>
                <View style={{ flex: 1.5 }}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    Bairro *
                  </Texto>
                  <TextInput
                    value={bairro}
                    onChangeText={setBairro}
                    style={estiloCampo}
                  />
                </View>
              </View>
            </Cartao>

            <View style={styles.rodapeAcoes}>
              <View>
                <Texto tamanho={13} cor="textoSecundario">
                  * Campos obrigatórios
                </Texto>
                <Texto tamanho={13} cor="textoSecundario">
                  Revise os dados antes de salvar.
                </Texto>
              </View>
              <View style={styles.linhaBotoes}>
                <Botao rotulo="Cancelar" />
                <Botao
                  rotulo="Salvar alterações"
                  icone="salvar"
                  variante="primario"
                />
              </View>
            </View>
          </View>

          <View style={styles.colunaLateral}>
            <Cartao style={styles.cartaoLateral}>
              <Texto accessibilityRole="header" tamanho={18} peso={600}>
                Operação da loja
              </Texto>
              <View style={{ alignSelf: 'flex-start' }}>
                <Etiqueta rotulo="Loja aberta" corPonto={cores.statusEntregue} />
              </View>

              <View>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Fuso horário
                </Texto>
                <TextInput
                  value={fusoHorario}
                  onChangeText={setFusoHorario}
                  style={estiloCampo}
                />
              </View>

              <View>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  Dias de funcionamento
                </Texto>
                <TextInput
                  value={diasFuncionamento}
                  onChangeText={setDiasFuncionamento}
                  style={estiloCampo}
                />
              </View>

              <View style={styles.linhaDupla}>
                <View style={styles.campoFlex}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    Abertura
                  </Texto>
                  <TextInput
                    value={abertura}
                    onChangeText={setAbertura}
                    style={estiloCampo}
                  />
                </View>
                <View style={styles.campoFlex}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    Fechamento
                  </Texto>
                  <TextInput
                    value={fechamento}
                    onChangeText={setFechamento}
                    style={estiloCampo}
                  />
                </View>
              </View>

              <Divisor />

              <View style={styles.linhaAlternador}>
                <View style={{ flex: 1 }}>
                  <Texto peso={500}>Entrega própria</Texto>
                  <Texto tamanho={13} cor="textoSecundario">
                    Organizar entregas no módulo Rotas.
                  </Texto>
                </View>
                <Switch
                  value={entregaPropria}
                  onValueChange={setEntregaPropria}
                  trackColor={{ false: cores.borda, true: cores.brand }}
                  thumbColor={cores.superficie}
                />
              </View>

              <View style={styles.linhaAlternador}>
                <View style={{ flex: 1 }}>
                  <Texto peso={500}>Retirada no local</Texto>
                  <Texto tamanho={13} cor="textoSecundario">
                    Permitir a modalidade retirada.
                  </Texto>
                </View>
                <Switch
                  value={retiradaLocal}
                  onValueChange={setRetiradaLocal}
                  trackColor={{ false: cores.borda, true: cores.brand }}
                  thumbColor={cores.superficie}
                />
              </View>

              <Texto tamanho={13} cor="textoSecundario" style={styles.textoAjuda}>
                O horário cadastrado serve como referência da operação. Revise o funcionamento em cada plataforma.
              </Texto>
            </Cartao>

            <Cartao style={styles.cartaoLateral}>
              <Texto accessibilityRole="header" tamanho={18} peso={600}>
                Responsável
              </Texto>
              <Texto tamanho={16} peso={500}>
                Marina Almeida
              </Texto>
              <Texto tamanho={13} cor="textoSecundario">
                Administradora • marina@vilabistro.com.br
              </Texto>
              <Texto tamanho={13} cor="textoSecundario" style={{ marginTop: Espacamento.small }}>
                Para alterar acessos, abra Usuários e permissões.
              </Texto>
            </Cartao>
          </View>
        </View>
      )}

      {/* ABA 2: USUÁRIOS E PERMISSÕES */}
      {abaAtiva === 'usuarios' && (
        <View style={[styles.layoutColunas, !emColunas && styles.layoutEmpilhado]}>
          <View style={styles.colunaPrincipal}>
            <Cartao style={styles.cartaoForm}>
              <Texto accessibilityRole="header" tamanho={18} peso={600}>
                Equipe do Vila Bistrô
              </Texto>
              <Texto tamanho={13} cor="textoSecundario">
                3 acessos ativos • 1 convite pendente
              </Texto>

              <TextInput
                value={buscaUsuario}
                onChangeText={setBuscaUsuario}
                placeholder="Buscar usuário por nome ou e-mail"
                placeholderTextColor={cores.textoSecundario}
                style={estiloCampo}
              />

              <View style={styles.linhaUsuario}>
                <View style={{ flex: 1 }}>
                  <Texto tamanho={16} peso={500}>Marina Almeida</Texto>
                  <Texto tamanho={13} cor="textoSecundario">marina@vilabistro.com.br • Administradora (Você)</Texto>
                </View>
                <Etiqueta rotulo="Ativo" corPonto={cores.statusEntregue} />
              </View>
              <Divisor />

              <View style={styles.linhaUsuario}>
                <View style={{ flex: 1 }}>
                  <Texto tamanho={16} peso={500}>Lucas Santos</Texto>
                  <Texto tamanho={13} cor="textoSecundario">lucas@vilabistro.com.br • Gerente</Texto>
                </View>
                <Etiqueta rotulo="Ativo" corPonto={cores.statusEntregue} />
              </View>
              <Divisor />

              <View style={styles.linhaUsuario}>
                <View style={{ flex: 1 }}>
                  <Texto tamanho={16} peso={500}>Ana Oliveira</Texto>
                  <Texto tamanho={13} cor="textoSecundario">ana@vilabistro.com.br • Operadora</Texto>
                </View>
                <Etiqueta rotulo="Ativo" corPonto={cores.statusEntregue} />
              </View>
              <Divisor />

              <View style={styles.linhaUsuario}>
                <View style={{ flex: 1 }}>
                  <Texto tamanho={16} peso={500}>Pedro Costa</Texto>
                  <Texto tamanho={13} cor="textoSecundario">pedro@vilabistro.com.br • Operador</Texto>
                </View>
                <Etiqueta rotulo="Convite pendente" corPonto={cores.statusPronto} />
              </View>
            </Cartao>

            <Cartao style={styles.cartaoForm}>
              <Texto accessibilityRole="header" tamanho={18} peso={600}>
                Funções e permissões
              </Texto>
              <View style={{ gap: Espacamento.small }}>
                <Texto peso={600}>Administradora</Texto>
                <Texto tamanho={13} cor="textoSecundario">
                  Acesso completo: equipe, estabelecimento, integrações, estoque, pedidos e relatórios.
                </Texto>
              </View>
              <Divisor />
              <View style={{ gap: Espacamento.small }}>
                <Texto peso={600}>Gerente</Texto>
                <Texto tamanho={13} cor="textoSecundario">
                  Gerencia pedidos e estoque, consulta relatórios e acompanha rotas. Sem gestão de usuários ou integrações.
                </Texto>
              </View>
              <Divisor />
              <View style={{ gap: Espacamento.small }}>
                <Texto peso={600}>Operador / Operadora</Texto>
                <Texto tamanho={13} cor="textoSecundario">
                  Acompanha e atualiza pedidos e consulta o estoque. Sem edição das configurações.
                </Texto>
              </View>
            </Cartao>
          </View>

          <View style={styles.colunaLateral}>
            <Cartao style={styles.cartaoLateral}>
              <Texto accessibilityRole="header" tamanho={18} peso={600}>
                Convidar usuário
              </Texto>
              <Texto tamanho={13} cor="textoSecundario">
                Envie um convite pessoal para sua equipe.
              </Texto>

              <View>
                <Texto tamanho={13} peso={500} style={styles.label}>Nome</Texto>
                <TextInput value={novoNome} onChangeText={setNovoNome} style={estiloCampo} />
              </View>

              <View>
                <Texto tamanho={13} peso={500} style={styles.label}>E-mail *</Texto>
                <TextInput value={novoEmail} onChangeText={setNovoEmail} style={estiloCampo} />
              </View>

              <View>
                <Texto tamanho={13} peso={500} style={styles.label}>Função *</Texto>
                <TextInput value={funcaoSelecionada} onChangeText={setFuncaoSelecionada} style={estiloCampo} />
              </View>

              <Botao rotulo="Enviar convite" icone="mais" variante="primario" />
            </Cartao>
          </View>
        </View>
      )}

      {/* ABA 3: INTEGRAÇÕES */}
      {abaAtiva === 'integracoes' && (
        <View style={{ gap: Espacamento.large }}>
          <Aviso
            icone="escudo"
            titulo="As plataformas mantêm o último estoque publicado"
            texto="Há 2 alterações ainda não salvas. Revise Hambúrguer da casa e Batata pequena na Gestão de estoque antes de salvar e sincronizar."
          />

          <View style={styles.gradeIntegracoes}>
            {CANAIS_INTEGRACOES.map((canal) => (
              <Cartao key={canal.nome} style={styles.cartaoCanal}>
                <View style={styles.linhaCabecalhoCanal}>
                  <Texto tamanho={18} peso={600}>{canal.nome}</Texto>
                  <Etiqueta rotulo="Conectado" corPonto={cores.statusEntregue} />
                </View>
                <Texto tamanho={13} cor="textoSecundario">
                  Vila Bistrô • Última sincronização: {canal.sync}
                </Texto>
                <Texto tamanho={13} cor="textoSecundario">
                  Estoque publicado • sincronização concluída
                </Texto>
                <View style={{ marginTop: Espacamento.small, gap: Espacamento.small }}>
                  <Botao rotulo="Revisar conexão" />
                  <Botao rotulo="Sincronizar novamente" icone="sincronizar" />
                </View>
              </Cartao>
            ))}
          </View>
        </View>
      )}

      {/* ABA 4: PREFERÊNCIAS */}
      {abaAtiva === 'preferencias' && (
        <View style={[styles.layoutColunas, !emColunas && styles.layoutEmpilhado]}>
          <View style={styles.colunaPrincipal}>
            <Cartao style={styles.cartaoForm}>
              <Texto accessibilityRole="header" tamanho={18} peso={600}>
                Preferências de estoque
              </Texto>
              <Texto tamanho={13} cor="textoSecundario">
                Defina os cuidados que fazem parte da sua rotina.
              </Texto>

              <View style={styles.linhaAlternador}>
                <View style={{ flex: 1 }}>
                  <Texto peso={500}>Baixa automática por pedido</Texto>
                  <Texto tamanho={13} cor="textoSecundario">
                    Reduzir o saldo do estoque central a cada pedido recebido.
                  </Texto>
                </View>
                <Switch
                  value={baixaAutomatica}
                  onValueChange={setBaixaAutomatica}
                  trackColor={{ false: cores.borda, true: cores.brand }}
                  thumbColor={cores.superficie}
                />
              </View>

              <View style={styles.linhaAlternador}>
                <View style={{ flex: 1 }}>
                  <Texto peso={500}>Indisponível ao chegar a zero</Texto>
                  <Texto tamanho={13} cor="textoSecundario">
                    Atualizar a disponibilidade nos canais conectados para evitar overselling.
                  </Texto>
                </View>
                <Switch
                  value={indisponivelZero}
                  onValueChange={setIndisponivelZero}
                  trackColor={{ false: cores.borda, true: cores.brand }}
                  thumbColor={cores.superficie}
                />
              </View>

              <View style={styles.linhaAlternador}>
                <View style={{ flex: 1 }}>
                  <Texto peso={500}>Alertas de estoque baixo</Texto>
                  <Texto tamanho={13} cor="textoSecundario">
                    Avisar quando o saldo chegar ao limite definido.
                  </Texto>
                </View>
                <Switch
                  value={alertasEstoqueBaixo}
                  onValueChange={setAlertasEstoqueBaixo}
                  trackColor={{ false: cores.borda, true: cores.brand }}
                  thumbColor={cores.superficie}
                />
              </View>

              <View style={styles.linhaDupla}>
                <View style={styles.campoFlex}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    Limite padrão para alerta
                  </Texto>
                  <TextInput value={limiteAlerta} onChangeText={setLimiteAlerta} style={estiloCampo} />
                </View>
                <View style={styles.campoFlex}>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    Unidade padrão
                  </Texto>
                  <TextInput value={unidadePadrao} onChangeText={setUnidadePadrao} style={estiloCampo} />
                </View>
              </View>
            </Cartao>

            <View style={styles.rodapeAcoes}>
              <View>
                <Texto tamanho={13} cor="textoSecundario">
                  Revise os dados antes de salvar.
                </Texto>
              </View>
              <View style={styles.linhaBotoes}>
                <Botao rotulo="Cancelar" />
                <Botao rotulo="Salvar preferências" icone="salvar" variante="primario" />
              </View>
            </View>
          </View>

          <View style={styles.colunaLateral}>
            <Cartao style={styles.cartaoLateral}>
              <Texto accessibilityRole="header" tamanho={18} peso={600}>
                Notificações
              </Texto>
              <Texto tamanho={13} cor="textoSecundario">
                Escolha quais avisos ajudam a sua equipe durante o serviço.
              </Texto>

              <View style={styles.linhaAlternador}>
                <Texto peso={500} style={{ flex: 1 }}>Novos pedidos</Texto>
                <Switch
                  value={notifNovosPedidos}
                  onValueChange={setNotifNovosPedidos}
                  trackColor={{ false: cores.borda, true: cores.brand }}
                  thumbColor={cores.superficie}
                />
              </View>

              <View style={styles.linhaAlternador}>
                <Texto peso={500} style={{ flex: 1 }}>Falhas de sincronização</Texto>
                <Switch
                  value={notifFalhasSync}
                  onValueChange={setNotifFalhasSync}
                  trackColor={{ false: cores.borda, true: cores.brand }}
                  thumbColor={cores.superficie}
                />
              </View>

              <View style={styles.linhaAlternador}>
                <Texto peso={500} style={{ flex: 1 }}>Estoque baixo ou esgotado</Texto>
                <Switch
                  value={notifEstoqueBaixo}
                  onValueChange={setNotifEstoqueBaixo}
                  trackColor={{ false: cores.borda, true: cores.brand }}
                  thumbColor={cores.superficie}
                />
              </View>

              <View style={styles.linhaAlternador}>
                <Texto peso={500} style={{ flex: 1 }}>Som de novos pedidos</Texto>
                <Switch
                  value={notifSom}
                  onValueChange={setNotifSom}
                  trackColor={{ false: cores.borda, true: cores.brand }}
                  thumbColor={cores.superficie}
                />
              </View>

              <View style={styles.linhaAlternador}>
                <Texto peso={500} style={{ flex: 1 }}>Resumo diário por e-mail</Texto>
                <Switch
                  value={notifResumoDiario}
                  onValueChange={setNotifResumoDiario}
                  trackColor={{ false: cores.borda, true: cores.brand }}
                  thumbColor={cores.superficie}
                />
              </View>

              <View>
                <Texto tamanho={13} peso={500} style={styles.label}>
                  E-mail para avisos
                </Texto>
                <TextInput value={emailAvisos} onChangeText={setEmailAvisos} style={estiloCampo} />
              </View>
            </Cartao>
          </View>
        </View>
      )}
    </Pagina>
  );
}

const styles = StyleSheet.create({
  abas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Espacamento.small,
  },
  layoutColunas: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Espacamento.large,
  },
  layoutEmpilhado: {
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
  linhaAlternador: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
    paddingVertical: Espacamento.xsmall,
  },
  textoAjuda: {
    lineHeight: 18,
    marginTop: Espacamento.small,
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
  linhaUsuario: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
    paddingVertical: Espacamento.small,
  },
  gradeIntegracoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Espacamento.large,
  },
  cartaoCanal: {
    flexBasis: '31%',
    flexGrow: 1,
    gap: Espacamento.small,
  },
  linhaCabecalhoCanal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

