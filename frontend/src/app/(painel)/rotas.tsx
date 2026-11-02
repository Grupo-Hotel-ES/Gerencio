import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CartaoResumo, Grade, Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import { Aviso, Botao, Cartao, Chip, Divisor, Etiqueta, Icone, Texto } from '@/components/dashboard/ui';
import { Espacamento, Raio } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';

type FiltroRota = 'planejadas' | 'em_rota' | 'concluidas';

const FILTROS: { id: FiltroRota; rotulo: string }[] = [
  { id: 'planejadas', rotulo: 'Planejadas · 1' },
  { id: 'em_rota', rotulo: 'Em rota · 0' },
  { id: 'concluidas', rotulo: 'Concluídas · 0' },
];

const ENTREGADORES = [
  {
    iniciais: 'AS',
    nome: 'Ana Souza',
    veiculo: 'Moto',
    status: 'Disponível',
    disponivel: true,
    info: 'Rota Centro atribuída',
  },
  {
    iniciais: 'BL',
    nome: 'Bruno Lopes',
    veiculo: 'Bicicleta',
    status: 'Disponível',
    disponivel: true,
    info: 'Sem rota atribuída',
  },
  {
    iniciais: 'CM',
    nome: 'Carlos Melo',
    veiculo: 'Moto',
    status: 'Indisponível',
    disponivel: false,
    info: 'Fora do turno',
  },
];

const PARADAS = [
  {
    ordem: 1,
    pedido: '#1041',
    canal: 'Keeta',
    cliente: 'João Almeida',
    endereco: 'Rua do Comércio, 45',
    detalhes: 'Centro • Portaria A',
    status: 'Pronto',
    chegada: '13:03',
  },
  {
    ordem: 2,
    pedido: '#1042',
    canal: 'Rappi',
    cliente: 'Beatriz Rocha',
    endereco: 'Av. Central, 120',
    detalhes: 'Centro • Apto. 302',
    status: 'Pronto',
    chegada: '13:11',
  },
  {
    ordem: 3,
    pedido: '#1043',
    canal: 'Uber Eats',
    cliente: 'Rafael Lima',
    endereco: 'Rua das Palmeiras, 90',
    detalhes: 'Centro • Casa 2',
    status: 'Preparando',
    chegada: '13:19',
  },
];

export default function GestaoDeRotas() {
  const cores = useCores();
  const larguraConteudo = useLarguraConteudo();
  const emColunas = larguraConteudo >= 980;

  const [filtro, setFiltro] = useState<FiltroRota>('planejadas');

  return (
    <Pagina
      titulo="Gestão de rotas"
      subtitulo="Organize as entregas da sua equipe, da cozinha até a última parada."
      acao={<Botao rotulo="Criar rota" icone="mais" variante="primario" />}>
      {/* Indicadores do topo */}
      <Grade colunas={emColunas ? 3 : 1}>
        <CartaoResumo
          rotulo="Rotas planejadas"
          valor={1}
          detalhe="Centro • saída prevista 12:55"
        />
        <CartaoResumo
          rotulo="Entregas na rota"
          valor={3}
          detalhe="2 prontas • 1 em preparo"
        />
        <CartaoResumo
          rotulo="Entregadores disponíveis"
          valor={2}
          detalhe="1 com rota atribuída"
        />
      </Grade>

      {/* Barra de Filtros */}
      <View style={styles.linhaFiltros}>
        <View style={styles.filtros}>
          {FILTROS.map(({ id, rotulo }) => (
            <Chip
              key={id}
              rotulo={rotulo}
              ativo={filtro === id}
              onPress={() => setFiltro(id)}
            />
          ))}
        </View>
        <Chip rotulo="Hoje, 11 out." />
      </View>

      {/* Conteúdo Principal */}
      <View style={[styles.colunas, !emColunas && styles.empilhado]}>
        {/* Rota Selecionada */}
        <View style={styles.colunaPrincipal}>
          <Cartao style={styles.cartaoRota}>
            <View style={styles.cabecalhoRota}>
              <View style={styles.tituloRota}>
                <View style={styles.linhaTituloRota}>
                  <Texto accessibilityRole="header" tamanho={20} peso={600}>
                    Rota Centro
                  </Texto>
                  <Etiqueta rotulo="Planejada" corPonto={cores.statusNovo} />
                </View>
                <Texto tamanho={16} peso={500}>
                  Ana Souza • Moto
                </Texto>
                <Texto tamanho={13} cor="textoSecundario">
                  3 entregas • 3,8 km • 24 min
                </Texto>
                <Texto tamanho={13} cor="textoSecundario">
                  Saída 12:55 • última parada 13:19 • estimativas
                </Texto>
              </View>

              <View style={styles.acoesRota}>
                <Botao rotulo="Trocar entregador" />
                <Botao rotulo="Editar sequência" />
              </View>
            </View>

            <Divisor />

            {/* Ponto de partida */}
            <View style={styles.pontoPartida}>
              <Icone nome="logo" cor={cores.textoPrincipal} />
              <View style={{ flex: 1 }}>
                <Texto peso={600}>Vila Bistrô • ponto de partida</Texto>
                <Texto tamanho={13} cor="textoSecundario">
                  Rua da Vila, 18 • Centro
                </Texto>
              </View>
            </View>

            <Divisor />

            {/* Lista de paradas */}
            <View style={styles.listaParadas}>
              {PARADAS.map((parada) => {
                const pronto = parada.status === 'Pronto';
                return (
                  <View key={parada.ordem} style={styles.itemParada}>
                    <View style={[styles.badgeOrdem, { backgroundColor: cores.brand }]}>
                      <Texto peso={700} cor="textOnBrand">
                        {parada.ordem}
                      </Texto>
                    </View>

                    <View style={styles.infoParada}>
                      <Texto peso={600}>
                        {parada.pedido} • {parada.canal}
                      </Texto>
                      <Texto tamanho={16} peso={500}>
                        {parada.cliente}
                      </Texto>
                      <Texto tamanho={13} cor="textoSecundario">
                        {parada.endereco}
                      </Texto>
                      <Texto tamanho={13} cor="textoSecundario">
                        {parada.detalhes}
                      </Texto>

                      <View style={{ alignSelf: 'flex-start', marginTop: Espacamento.xsmall }}>
                        <Etiqueta
                          rotulo={parada.status}
                          corPonto={pronto ? cores.statusEntregue : cores.statusPreparando}
                        />
                      </View>
                    </View>

                    <View style={styles.direitaParada}>
                      <Texto tamanho={13} cor="textoSecundario">
                        Chegada {parada.chegada}
                      </Texto>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Aviso de espera */}
            <Aviso
              icone="info"
              titulo="Aguardando o pedido #1043"
              texto="A rota só pode sair quando os três pedidos estiverem prontos. Preparo previsto até 12:55."
            />

            <View style={styles.rodapeRota}>
              <Texto tamanho={13} cor="textoSecundario">
                Arraste as paradas para reorganizar.
              </Texto>
              <Botao rotulo="Revisar rota" variante="primario" />
            </View>
          </Cartao>
        </View>

        {/* Coluna Lateral */}
        <View style={styles.colunaLateral}>
          {/* Card Entregadores próprios */}
          <Cartao style={styles.blocoLateral}>
            <Texto accessibilityRole="header" tamanho={18} peso={600}>
              Entregadores próprios
            </Texto>

            {ENTREGADORES.map((entregador, idx) => (
              <View key={entregador.nome}>
                <View style={styles.itemEntregador}>
                  <View style={[styles.avatar, { backgroundColor: cores.borda }]}>
                    <Texto peso={600} tamanho={13}>
                      {entregador.iniciais}
                    </Texto>
                  </View>

                  <View style={{ flex: 1, gap: Espacamento.xsmall }}>
                    <View style={styles.linhaNomeEntregador}>
                      <Texto peso={600}>{entregador.nome}</Texto>
                      <Etiqueta
                        rotulo={entregador.status}
                        corPonto={entregador.disponivel ? cores.statusEntregue : cores.statusCancelado}
                      />
                    </View>
                    <Texto tamanho={13} cor="textoSecundario">
                      {entregador.veiculo} • {entregador.info}
                    </Texto>
                  </View>
                </View>
                {idx < ENTREGADORES.length - 1 && <Divisor />}
              </View>
            ))}

            <Botao rotulo="Cadastrar entregador" icone="mais" />
          </Cartao>

          {/* Card Sem rota própria */}
          <Cartao style={styles.blocoLateral}>
            <Texto accessibilityRole="header" tamanho={18} peso={600}>
              Sem rota própria
            </Texto>
            <Texto peso={600}>#1046 • WhatsApp</Texto>
            <Texto tamanho={13} cor="textoSecundario">
              Novo • definir entregador após o aceite
            </Texto>
            <Texto tamanho={13} cor="textoSecundario">
              #1045 usa entrega da plataforma. #1044 é retirada no restaurante.
            </Texto>
            <Botao rotulo="Adicionar entrega à rota" icone="mais" />
          </Cartao>
        </View>
      </View>
    </Pagina>
  );
}

const styles = StyleSheet.create({
  linhaFiltros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
  },
  filtros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Espacamento.small,
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
  cartaoRota: {
    gap: Espacamento.large,
  },
  cabecalhoRota: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Espacamento.large,
  },
  tituloRota: {
    gap: Espacamento.xsmall,
    flex: 1,
  },
  linhaTituloRota: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
    marginBottom: Espacamento.xsmall,
  },
  acoesRota: {
    flexDirection: 'row',
    gap: Espacamento.small,
    alignItems: 'flex-start',
  },
  pontoPartida: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.medium,
    paddingVertical: Espacamento.small,
  },
  listaParadas: {
    gap: Espacamento.large,
  },
  itemParada: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Espacamento.medium,
    paddingVertical: Espacamento.small,
    borderBottomWidth: 1,
    borderBottomColor: '#33333322',
  },
  badgeOrdem: {
    width: 28,
    height: 28,
    borderRadius: Raio.small / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoParada: {
    flex: 1,
    gap: Espacamento.xsmall,
  },
  direitaParada: {
    alignItems: 'flex-end',
  },
  rodapeRota: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
    paddingTop: Espacamento.small,
  },
  blocoLateral: {
    gap: Espacamento.large,
  },
  itemEntregador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.medium,
    paddingVertical: Espacamento.small,
  },
  linhaNomeEntregador: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.small,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Raio.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

