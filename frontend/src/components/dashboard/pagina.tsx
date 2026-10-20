import { Children, createContext, useContext, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Cartao, Texto } from './ui';

import { Espacamento } from '@/constants/tokens';

// Largura da área de conteúdo no protótipo web (1440 menos a sidebar), usada até o primeiro layout.
const LarguraConteudo = createContext(1216);

export const LarguraConteudoProvider = LarguraConteudo.Provider;

/** Largura disponível para a página, já descontada a sidebar. */
export function useLarguraConteudo() {
  return useContext(LarguraConteudo);
}

type PaginaProps = {
  titulo: string;
  subtitulo: string;
  /** Ação principal, exibida à direita do título. */
  acao?: ReactNode;
  children: ReactNode;
};

export function Pagina({ titulo, subtitulo, acao, children }: PaginaProps) {
  return (
    <ScrollView contentContainerStyle={styles.conteudo}>
      <View style={styles.cabecalho}>
        <View style={styles.titulos}>
          <Texto accessibilityRole="header" tamanho={44} style={styles.titulo}>
            {titulo}
          </Texto>
          <Texto tamanho={16} cor="textoSecundario">
            {subtitulo}
          </Texto>
        </View>
        {acao}
      </View>
      {children}
    </ScrollView>
  );
}

/** Distribui os filhos em colunas de mesma largura. */
export function Grade({ colunas, children }: { colunas: number; children: ReactNode }) {
  return (
    <View style={styles.grade}>
      {Children.map(children, (filho) => (
        <View style={[styles.celula, { width: `${100 / colunas}%` }]}>{filho}</View>
      ))}
    </View>
  );
}

export function CartaoResumo({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string;
  valor: string | number;
  detalhe: string;
}) {
  return (
    <Cartao style={styles.resumo}>
      <Texto cor="textoSecundario">{rotulo}</Texto>
      <Texto tamanho={24} peso={600}>
        {valor}
      </Texto>
      <Texto tamanho={13} cor="textoSecundario">
        {detalhe}
      </Texto>
    </Cartao>
  );
}

const styles = StyleSheet.create({
  conteudo: {
    gap: Espacamento.large,
    paddingHorizontal: Espacamento.large,
    paddingTop: Espacamento.xlarge,
    paddingBottom: Espacamento.large,
  },
  cabecalho: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.large,
  },
  titulos: {
    flexShrink: 1,
    gap: Espacamento.small,
  },
  titulo: {
    lineHeight: 52,
    letterSpacing: -0.5,
  },
  // As células usam padding e a grade margem negativa para formar o espaçamento entre cartões.
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    margin: -Espacamento.small / 2 - 2,
  },
  celula: {
    padding: Espacamento.small / 2 + 2,
  },
  resumo: {
    gap: Espacamento.xsmall,
  },
});
