import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { CartaoResumo, Grade, Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import { Botao, Cartao, Chip, Divisor, Etiqueta, Icone, Texto } from '@/components/dashboard/ui';
import { Espacamento, Raio } from '@/constants/tokens';
import {
  MOTOBOYS_DEMO,
  ROTULOS_STATUS_MOTOBOY,
  type Motoboy,
  type StatusMotoboy,
} from '@/data/motoboys';
import { useCores } from '@/hooks/use-cores';

type FiltroStatus = 'todos' | StatusMotoboy;

const FILTROS: { id: FiltroStatus; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'disponivel', rotulo: 'Disponíveis' },
  { id: 'em_entrega', rotulo: 'Em entrega' },
  { id: 'inativo', rotulo: 'Inativos' },
];

export default function ControleDeMotoboys() {
  const cores = useCores();
  const larguraConteudo = useLarguraConteudo();

  const [motoboys, setMotoboys] = useState<Motoboy[]>(MOTOBOYS_DEMO);
  const [filtro, setFiltro] = useState<FiltroStatus>('todos');
  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);

  // Estado do formulário de cadastro/edição
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [motoboyEmEdicao, setMotoboyEmEdicao] = useState<Motoboy | null>(null);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [placa, setPlaca] = useState('');
  const [statusForm, setStatusForm] = useState<StatusMotoboy>('disponivel');
  const [erroForm, setErroForm] = useState<string | null>(null);

  // Métricas calculadas
  const disponiveis = motoboys.filter((m) => m.status === 'disponivel').length;
  const emEntrega = motoboys.filter((m) => m.status === 'em_entrega').length;
  const inativos = motoboys.filter((m) => m.status === 'inativo').length;
  const contagem: Record<FiltroStatus, number> = {
    todos: motoboys.length,
    disponivel: disponiveis,
    em_entrega: emEntrega,
    inativo: inativos,
  };

  // Filtragem e busca
  const termo = busca.trim().toLowerCase();
  const visiveis = motoboys.filter((m) => {
    const atendeFiltro = filtro === 'todos' || m.status === filtro;
    const atendeBusca =
      !termo ||
      m.nome.toLowerCase().includes(termo) ||
      m.telefone.includes(termo) ||
      m.cpf.includes(termo) ||
      (m.placa && m.placa.toLowerCase().includes(termo));
    return atendeFiltro && atendeBusca;
  });

  const abrirFormularioNovo = () => {
    setMotoboyEmEdicao(null);
    setNome('');
    setCpf('');
    setTelefone('');
    setEmail('');
    setPlaca('');
    setStatusForm('disponivel');
    setErroForm(null);
    setFormularioAberto(true);
  };

  const abrirFormularioEdicao = (m: Motoboy) => {
    setMotoboyEmEdicao(m);
    setNome(m.nome);
    setCpf(m.cpf);
    setTelefone(m.telefone);
    setEmail(m.email);
    setPlaca(m.placa ?? '');
    setStatusForm(m.status);
    setErroForm(null);
    setFormularioAberto(true);
  };

  const fecharFormulario = () => {
    setFormularioAberto(false);
    setMotoboyEmEdicao(null);
    setErroForm(null);
  };

  const salvarFormulario = () => {
    if (!nome.trim() || !telefone.trim() || !cpf.trim()) {
      setErroForm('Nome, CPF e telefone são obrigatórios.');
      return;
    }

    if (motoboyEmEdicao) {
      // Edição
      setMotoboys((atuais) =>
        atuais.map((m) =>
          m.id === motoboyEmEdicao.id
            ? {
                ...m,
                nome: nome.trim(),
                cpf: cpf.trim(),
                telefone: telefone.trim(),
                email: email.trim(),
                placa: placa.trim() || undefined,
                status: statusForm,
              }
            : m,
        ),
      );
    } else {
      // Cadastro novo
      const novoId = motoboys.length > 0 ? Math.max(...motoboys.map((m) => m.id)) + 1 : 1;
      const novoMotoboy: Motoboy = {
        id: novoId,
        nome: nome.trim(),
        cpf: cpf.trim(),
        telefone: telefone.trim(),
        email: email.trim(),
        placa: placa.trim() || undefined,
        status: statusForm,
        entregasHoje: 0,
      };
      setMotoboys((atuais) => [novoMotoboy, ...atuais]);
    }

    fecharFormulario();
  };

  const alternarStatus = (m: Motoboy) => {
    const novoStatus: StatusMotoboy = m.status === 'inativo' ? 'disponivel' : 'inativo';
    setMotoboys((atuais) =>
      atuais.map((item) => (item.id === m.id ? { ...item, status: novoStatus } : item)),
    );
  };

  const corDoStatus = (status: StatusMotoboy) => {
    switch (status) {
      case 'disponivel':
        return cores.statusEntregue;
      case 'em_entrega':
        return cores.statusPreparando;
      case 'inativo':
        return cores.statusCancelado;
    }
  };

  const emColunas = larguraConteudo >= 1000;
  const compacto = larguraConteudo < 720;
  const estiloControle = [
    styles.controle,
    { borderColor: cores.borda, backgroundColor: cores.superficie },
  ];

  return (
    <Pagina
      titulo="Controle de motoboys"
      subtitulo="Acompanhe a disponibilidade, gerencie entregadores e organize suas entregas."
      acao={
        <Botao
          rotulo="Cadastrar motoboy"
          icone="mais"
          variante="primario"
          onPress={abrirFormularioNovo}
        />
      }>
      <Grade colunas={emColunas ? 4 : 2}>
        <CartaoResumo
          rotulo="Total cadastrados"
          valor={motoboys.length}
          detalhe="Entregadores ativos e inativos"
        />
        <CartaoResumo
          rotulo="Disponíveis"
          valor={disponiveis}
          detalhe={disponiveis === 0 ? 'Nenhum motoboy livre' : 'Prontos para nova entrega'}
        />
        <CartaoResumo
          rotulo="Em entrega"
          valor={emEntrega}
          detalhe={emEntrega === 0 ? 'Nenhuma entrega em rota' : 'Pedidos a caminho'}
        />
        <CartaoResumo
          rotulo="Inativos"
          valor={inativos}
          detalhe={inativos === 0 ? 'Todos disponíveis ou em rota' : 'Sem escala no momento'}
        />
      </Grade>

      {formularioAberto && (
        <Cartao style={styles.cartaoFormulario}>
          <View style={styles.linhaTitulo}>
            <Texto tamanho={18} peso={600}>
              {motoboyEmEdicao ? `Editar motoboy: ${motoboyEmEdicao.nome}` : 'Cadastrar novo motoboy'}
            </Texto>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar formulário"
              onPress={fecharFormulario}>
              <Icone nome="fechar" />
            </Pressable>
          </View>

          {erroForm && (
            <View
              style={[
                styles.alertaErro,
                { backgroundColor: cores.fundo, borderColor: cores.feedbackErro },
              ]}>
              <Texto cor="feedbackErro" peso={500}>
                {erroForm}
              </Texto>
            </View>
          )}

          <View style={[styles.gridCampos, emColunas && styles.gridCamposDuasColunas]}>
            <View style={styles.grupoCampo}>
              <Texto peso={500} cor="textoSecundario">
                Nome completo *
              </Texto>
              <TextInput
                value={nome}
                onChangeText={setNome}
                placeholder="Ex.: Carlos Eduardo Silva"
                placeholderTextColor={cores.textoSecundario}
                style={[
                  styles.input,
                  {
                    color: cores.textoPrincipal,
                    borderColor: cores.borda,
                    backgroundColor: cores.fundo,
                  },
                ]}
              />
            </View>

            <View style={styles.grupoCampo}>
              <Texto peso={500} cor="textoSecundario">
                Telefone / WhatsApp *
              </Texto>
              <TextInput
                value={telefone}
                onChangeText={setTelefone}
                placeholder="(11) 98765-4321"
                placeholderTextColor={cores.textoSecundario}
                keyboardType="phone-pad"
                style={[
                  styles.input,
                  {
                    color: cores.textoPrincipal,
                    borderColor: cores.borda,
                    backgroundColor: cores.fundo,
                  },
                ]}
              />
            </View>

            <View style={styles.grupoCampo}>
              <Texto peso={500} cor="textoSecundario">
                CPF *
              </Texto>
              <TextInput
                value={cpf}
                onChangeText={setCpf}
                placeholder="123.456.789-01"
                placeholderTextColor={cores.textoSecundario}
                style={[
                  styles.input,
                  {
                    color: cores.textoPrincipal,
                    borderColor: cores.borda,
                    backgroundColor: cores.fundo,
                  },
                ]}
              />
            </View>

            <View style={styles.grupoCampo}>
              <Texto peso={500} cor="textoSecundario">
                E-mail
              </Texto>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="motoboy@email.com"
                placeholderTextColor={cores.textoSecundario}
                keyboardType="email-address"
                autoCapitalize="none"
                style={[
                  styles.input,
                  {
                    color: cores.textoPrincipal,
                    borderColor: cores.borda,
                    backgroundColor: cores.fundo,
                  },
                ]}
              />
            </View>

            <View style={styles.grupoCampo}>
              <Texto peso={500} cor="textoSecundario">
                Placa da moto
              </Texto>
              <TextInput
                value={placa}
                onChangeText={setPlaca}
                placeholder="ABC1D23"
                placeholderTextColor={cores.textoSecundario}
                autoCapitalize="characters"
                style={[
                  styles.input,
                  {
                    color: cores.textoPrincipal,
                    borderColor: cores.borda,
                    backgroundColor: cores.fundo,
                  },
                ]}
              />
            </View>

            <View style={styles.grupoCampo}>
              <Texto peso={500} cor="textoSecundario">
                Situação inicial
              </Texto>
              <View style={styles.opcoesStatus}>
                {(['disponivel', 'em_entrega', 'inativo'] as StatusMotoboy[]).map((st) => (
                  <Chip
                    key={st}
                    rotulo={ROTULOS_STATUS_MOTOBOY[st]}
                    ativo={statusForm === st}
                    onPress={() => setStatusForm(st)}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.botoesFormulario}>
            <Botao rotulo="Cancelar" variante="contorno" onPress={fecharFormulario} />
            <Botao
              rotulo={motoboyEmEdicao ? 'Salvar alterações' : 'Confirmar cadastro'}
              icone="salvar"
              variante="primario"
              onPress={salvarFormulario}
            />
          </View>
        </Cartao>
      )}

      <Cartao style={styles.tabela}>
        <View style={styles.linhaTitulo}>
          <Texto accessibilityRole="header" tamanho={18} peso={600}>
            Equipe de entregadores
          </Texto>
          {buscando ? (
            <View style={estiloControle}>
              <Icone nome="busca" />
              <TextInput
                autoFocus
                value={busca}
                onChangeText={setBusca}
                onBlur={() => !busca && setBuscando(false)}
                placeholder="Nome, telefone, CPF ou placa"
                placeholderTextColor={cores.textoSecundario}
                accessibilityLabel="Buscar motoboy"
                style={[styles.campoBusca, { color: cores.textoPrincipal }]}
              />
            </View>
          ) : (
            <Botao rotulo="Buscar motoboy" icone="busca" onPress={() => setBuscando(true)} />
          )}
        </View>

        <View style={styles.filtros}>
          {FILTROS.map(({ id, rotulo }) => (
            <Chip
              key={id}
              rotulo={`${rotulo} · ${contagem[id]}`}
              ativo={filtro === id}
              onPress={() => setFiltro(id)}
            />
          ))}
        </View>

        <View>
          <View style={[styles.linha, styles.cabecalhoTabela, { backgroundColor: cores.fundo }]}>
            <Texto peso={600} style={styles.colunaNome}>
              Motoboy
            </Texto>
            {!compacto && (
              <Texto peso={600} style={styles.colunaContato}>
                Contato
              </Texto>
            )}
            {!compacto && (
              <Texto peso={600} style={styles.colunaEntregas}>
                Entregas hoje
              </Texto>
            )}
            <Texto peso={600} style={styles.colunaStatus}>
              Situação
            </Texto>
            <Texto peso={600} style={styles.colunaAcoes}>
              Ações
            </Texto>
          </View>

          {visiveis.length === 0 ? (
            <View style={styles.linhaVazia}>
              <Texto cor="textoSecundario">Nenhum motoboy encontrado com o filtro atual.</Texto>
            </View>
          ) : (
            visiveis.map((motoboy) => (
              <View key={motoboy.id}>
                <View style={styles.linha}>
                  <View style={styles.colunaNome}>
                    <Texto tamanho={15} peso={500}>
                      {motoboy.nome}
                    </Texto>
                    <Texto tamanho={13} cor="textoSecundario">
                      {motoboy.placa ? `Moto • ${motoboy.placa}` : `CPF: ${motoboy.cpf}`}
                    </Texto>
                  </View>

                  {!compacto && (
                    <View style={styles.colunaContato}>
                      <Texto tamanho={14} peso={500}>
                        {motoboy.telefone}
                      </Texto>
                      <Texto tamanho={13} cor="textoSecundario">
                        {motoboy.email || 'Sem e-mail'}
                      </Texto>
                    </View>
                  )}

                  {!compacto && (
                    <View style={styles.colunaEntregas}>
                      <Texto tamanho={15} peso={600}>
                        {motoboy.entregasHoje}
                      </Texto>
                    </View>
                  )}

                  <View style={styles.colunaStatus}>
                    <Etiqueta
                      rotulo={ROTULOS_STATUS_MOTOBOY[motoboy.status]}
                      corPonto={corDoStatus(motoboy.status)}
                    />
                  </View>

                  <View style={styles.colunaAcoes}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Editar ${motoboy.nome}`}
                      onPress={() => abrirFormularioEdicao(motoboy)}
                      style={[
                        styles.botaoAcao,
                        { borderColor: cores.borda, backgroundColor: cores.superficie },
                      ]}>
                      <Icone nome="editar" tamanho={16} />
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        motoboy.status === 'inativo'
                          ? `Ativar ${motoboy.nome}`
                          : `Desativar ${motoboy.nome}`
                      }
                      onPress={() => alternarStatus(motoboy)}
                      style={[
                        styles.botaoAcao,
                        {
                          borderColor:
                            motoboy.status === 'inativo' ? cores.brand : cores.borda,
                          backgroundColor:
                            motoboy.status === 'inativo' ? cores.brand : cores.fundo,
                        },
                      ]}>
                      <Texto
                        tamanho={12}
                        peso={600}
                        cor={motoboy.status === 'inativo' ? 'textOnBrand' : 'textoSecundario'}>
                        {motoboy.status === 'inativo' ? 'Ativar' : 'Desativar'}
                      </Texto>
                    </Pressable>
                  </View>
                </View>
                <Divisor />
              </View>
            ))
          )}
        </View>
      </Cartao>
    </Pagina>
  );
}

const styles = StyleSheet.create({
  tabela: {
    padding: Espacamento.large,
    gap: Espacamento.large,
  },
  linhaTitulo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
  },
  controle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
    height: 36,
    paddingHorizontal: Espacamento.medium,
    borderWidth: 1,
    borderRadius: Raio.small,
    minWidth: 260,
  },
  campoBusca: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  filtros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Espacamento.small,
  },
  cabecalhoTabela: {
    borderTopLeftRadius: Raio.small,
    borderTopRightRadius: Raio.small,
    paddingVertical: Espacamento.medium,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Espacamento.medium,
    paddingHorizontal: Espacamento.small,
  },
  linhaVazia: {
    padding: Espacamento.xlarge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colunaNome: {
    flex: 2,
    gap: 2,
  },
  colunaContato: {
    flex: 2,
    gap: 2,
  },
  colunaEntregas: {
    width: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colunaStatus: {
    width: 140,
  },
  colunaAcoes: {
    width: 150,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Espacamento.small,
  },
  botaoAcao: {
    paddingHorizontal: Espacamento.small,
    paddingVertical: Espacamento.xsmall + 2,
    borderRadius: Raio.small,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartaoFormulario: {
    padding: Espacamento.large,
    gap: Espacamento.large,
    borderWidth: 1,
  },
  alertaErro: {
    padding: Espacamento.medium,
    borderRadius: Raio.small,
    borderWidth: 1,
  },
  gridCampos: {
    gap: Espacamento.medium,
  },
  gridCamposDuasColunas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  grupoCampo: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: Espacamento.xsmall,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderRadius: Raio.small,
    paddingHorizontal: Espacamento.medium,
    fontSize: 14,
  },
  opcoesStatus: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Espacamento.small,
    marginTop: Espacamento.xsmall,
  },
  botoesFormulario: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Espacamento.medium,
  },
});
