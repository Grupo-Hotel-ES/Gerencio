import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { CartaoResumo, Grade, Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import { Aviso, Botao, Cartao, Chip, Divisor, Etiqueta, Icone, Texto } from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import {
  CANAIS_CONECTADOS,
  ESTOQUE_DEMO,
  ULTIMA_SINCRONIZACAO_DEMO,
  type ProdutoEstoque,
} from '@/data/estoque';
import { formatarHora } from '@/data/pedidos';
import { useCores } from '@/hooks/use-cores';

type Filtro = 'todos' | 'disponiveis' | 'esgotados';

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'disponiveis', rotulo: 'Disponíveis' },
  { id: 'esgotados', rotulo: 'Esgotados' },
];

function plural(quantidade: number, singular: string, pluralizado: string) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralizado}`;
}

export default function GestaoDeEstoque() {
  const cores = useCores();
  const larguraConteudo = useLarguraConteudo();
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>(ESTOQUE_DEMO);
  const [sincronizadoAs, setSincronizadoAs] = useState(ULTIMA_SINCRONIZACAO_DEMO);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [buscando, setBuscando] = useState(false);
  const [busca, setBusca] = useState('');

  const disponiveis = produtos.filter((p) => p.quantidade > 0).length;
  const esgotados = produtos.length - disponiveis;
  const pendentes = produtos.filter((p) => p.quantidade !== p.publicado).length;
  const contagem: Record<Filtro, number> = { todos: produtos.length, disponiveis, esgotados };

  const termo = busca.trim().toLowerCase();
  const visiveis = produtos.filter(
    (p) =>
      (filtro === 'todos' || (filtro === 'disponiveis') === p.quantidade > 0) &&
      (!termo || p.nome.toLowerCase().includes(termo)),
  );

  const ajustar = (id: number, delta: number) =>
    setProdutos((atuais) =>
      atuais.map((p) => (p.id === id ? { ...p, quantidade: Math.max(0, p.quantidade + delta) } : p)),
    );

  const salvar = () => {
    setProdutos((atuais) => atuais.map((p) => ({ ...p, publicado: p.quantidade })));
    setSincronizadoAs(formatarHora(new Date()));
  };

  const emColunas = larguraConteudo >= 1000;
  const compacto = larguraConteudo < 640;
  const controle = [styles.controle, { borderColor: cores.borda, backgroundColor: cores.superficie }];

  return (
    <Pagina
      titulo="Gestão de estoque"
      subtitulo="Defina o que está disponível hoje e mantenha os canais alinhados."
      acao={<Botao rotulo="Cadastrar produto" icone="mais" variante="primario" />}>
      <Grade colunas={emColunas ? 3 : 1}>
        <CartaoResumo
          rotulo="Produtos cadastrados"
          valor={produtos.length}
          detalhe="Catálogo de hoje • 11 out."
        />
        <CartaoResumo
          rotulo="Disponíveis"
          valor={disponiveis}
          detalhe={
            esgotados === 0
              ? 'Nenhum produto esgotado'
              : plural(esgotados, 'produto esgotado', 'produtos esgotados')
          }
        />
        <CartaoResumo
          rotulo="Alterações pendentes"
          valor={pendentes}
          detalhe={pendentes === 0 ? 'Canais com o estoque atual' : 'Ainda não enviadas aos canais'}
        />
      </Grade>

      {pendentes > 0 && (
        <Aviso
          icone="salvar"
          titulo={`${plural(pendentes, 'alteração', 'alterações')} ainda não ${pendentes === 1 ? 'salva' : 'salvas'}`}
          texto="As plataformas mantêm o último estoque publicado. Salve para aplicar as novas quantidades nos seis canais."
        />
      )}

      <View style={[styles.colunas, !emColunas && styles.empilhado]}>
        <Cartao style={styles.tabela}>
          <View style={styles.linhaTitulo}>
            <Texto accessibilityRole="header" tamanho={18} peso={500}>
              Estoque disponível no dia
            </Texto>
            {buscando ? (
              <View style={controle}>
                <Icone nome="busca" />
                <TextInput
                  autoFocus
                  value={busca}
                  onChangeText={setBusca}
                  onBlur={() => !busca && setBuscando(false)}
                  placeholder="Nome do produto"
                  placeholderTextColor={cores.textoSecundario}
                  accessibilityLabel="Buscar produto"
                  style={[styles.campoBusca, { color: cores.textoPrincipal }]}
                />
              </View>
            ) : (
              <Botao rotulo="Buscar produto" icone="busca" onPress={() => setBuscando(true)} />
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
              <Texto peso={500} style={styles.colunaProduto}>
                Produto
              </Texto>
              {!compacto && (
                <Texto peso={500} style={styles.colunaPublicado}>
                  Publicado
                </Texto>
              )}
              <Texto peso={500} style={styles.colunaQuantidade}>
                Quantidade
              </Texto>
              <Texto peso={500} style={styles.colunaDisponibilidade}>
                Disponibilidade
              </Texto>
            </View>

            {visiveis.map((produto) => {
              const disponivel = produto.quantidade > 0;
              const pendente = produto.quantidade !== produto.publicado;
              return (
                <View key={produto.id}>
                  <View style={styles.linha}>
                    <View style={[styles.colunaProduto, styles.produto]}>
                      <Texto tamanho={16} peso={500}>
                        {produto.nome}
                      </Texto>
                      <Texto tamanho={13} cor="textoSecundario">
                        {produto.categoria}
                        {pendente && ' • Alteração pendente'}
                      </Texto>
                    </View>
                    {!compacto && (
                      <Texto tamanho={16} style={styles.colunaPublicado}>
                        {produto.publicado} un.
                      </Texto>
                    )}
                    <View style={styles.colunaQuantidade}>
                      <View style={[styles.seletor, { borderColor: cores.borda }]}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Diminuir ${produto.nome}`}
                          disabled={!disponivel}
                          onPress={() => ajustar(produto.id, -1)}
                          style={styles.passo}>
                          <Icone nome="menos" tamanho={18} />
                        </Pressable>
                        <Texto tamanho={16} peso={600} style={styles.valor}>
                          {produto.quantidade}
                        </Texto>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Aumentar ${produto.nome}`}
                          onPress={() => ajustar(produto.id, 1)}
                          style={styles.passo}>
                          <Icone nome="mais" tamanho={18} />
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.colunaDisponibilidade}>
                      <Etiqueta
                        rotulo={disponivel ? 'Disponível' : 'Esgotado'}
                        corPonto={disponivel ? cores.statusEntregue : cores.statusCancelado}
                      />
                    </View>
                  </View>
                  <Divisor />
                </View>
              );
            })}

            {visiveis.length === 0 && (
              <Texto cor="textoSecundario" style={styles.vazio}>
                Nenhum produto encontrado.
              </Texto>
            )}
          </View>

          <View style={styles.linhaTitulo}>
            <Texto tamanho={13} cor="textoSecundario">
              {pendentes === 0
                ? 'Nenhuma alteração pendente'
                : `${plural(pendentes, 'produto alterado', 'produtos alterados')} • revisão local`}
            </Texto>
            <Botao
              rotulo="Salvar e sincronizar"
              icone="sincronizar"
              variante="primario"
              disabled={pendentes === 0}
              onPress={salvar}
              style={pendentes === 0 && styles.desabilitado}
            />
          </View>
        </Cartao>

        <View style={[styles.lateral, !emColunas && styles.lateralEmpilhada]}>
          <Cartao style={styles.bloco}>
            <Texto accessibilityRole="header" tamanho={18} peso={500}>
              Conexão com os canais
            </Texto>
            <Texto tamanho={13} cor="textoSecundario">
              Último estoque salvo sincronizado às {sincronizadoAs}.
            </Texto>
            <View style={styles.canais}>
              {CANAIS_CONECTADOS.map((canal) => (
                <Etiqueta key={canal} rotulo={canal} corPonto={cores.statusEntregue} />
              ))}
            </View>
            <Divisor />
            <Texto tamanho={13} cor="textoSecundario" style={styles.paragrafo}>
              A baixa por pedido é automática. O saldo atualizado é enviado aos outros canais para
              evitar overselling.
            </Texto>
          </Cartao>

          <Cartao style={styles.bloco}>
            <Icone nome="escudo" tamanho={28} />
            <Texto accessibilityRole="header" tamanho={18} peso={500}>
              Venda só o que tem
            </Texto>
            <Texto tamanho={16} cor="textoSecundario" style={styles.destaque}>
              Quando o saldo chega a zero, o produto fica indisponível nos canais conectados.
            </Texto>
            <Texto tamanho={13} cor="textoSecundario" style={styles.paragrafo}>
              As alterações manuais só valem depois de salvar e sincronizar.
            </Texto>
          </Cartao>
        </View>
      </View>
    </Pagina>
  );
}

const styles = StyleSheet.create({
  colunas: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Espacamento.large,
  },
  empilhado: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  tabela: {
    flex: 1,
    gap: Espacamento.large,
  },
  linhaTitulo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
  },
  controle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
    height: 44,
    paddingHorizontal: Espacamento.medium,
    borderWidth: 1,
    borderRadius: Raio.small,
  },
  campoBusca: {
    width: 160,
    fontFamily: Fonts?.sans,
    fontSize: 14,
    outlineWidth: 0,
  },
  filtros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Espacamento.small,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.medium,
    minHeight: 72,
  },
  cabecalhoTabela: {
    minHeight: 36,
    paddingLeft: Espacamento.small,
    borderRadius: Raio.small / 2,
  },
  colunaProduto: {
    flex: 1,
  },
  colunaPublicado: {
    width: 88,
  },
  colunaQuantidade: {
    width: 100,
  },
  colunaDisponibilidade: {
    width: 132,
    alignItems: 'flex-start',
  },
  produto: {
    gap: Espacamento.xsmall,
  },
  seletor: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: 36,
    borderWidth: 1,
    borderRadius: Raio.small,
  },
  passo: {
    width: 32,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valor: {
    minWidth: 28,
    textAlign: 'center',
  },
  vazio: {
    paddingVertical: Espacamento.xlarge,
    textAlign: 'center',
  },
  desabilitado: {
    opacity: 0.5,
  },
  lateral: {
    width: 300,
    gap: Espacamento.large,
  },
  lateralEmpilhada: {
    width: '100%',
  },
  bloco: {
    gap: Espacamento.medium,
  },
  canais: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Espacamento.small,
    marginVertical: Espacamento.xsmall,
  },
  paragrafo: {
    lineHeight: 18,
  },
  destaque: {
    lineHeight: 22,
  },
});
