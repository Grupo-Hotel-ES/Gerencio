import type { ReactNode } from 'react';
import { StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';

import { Botao, Texto } from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';

/** Rótulo + campo de texto no visual das telas de Configurações. */
export function CampoTexto({ rotulo, ajuda, flex, style, editable = true, ...props }: TextInputProps & {
  rotulo: string; ajuda?: string; flex?: number;
}) {
  const cores = useCores();
  return (
    // minWidth: em telas estreitas, os campos de uma linha quebram para a de baixo
    <View style={flex !== undefined ? { flex, minWidth: 150 } : undefined}>
      <Texto tamanho={13} peso={500} style={estilos.label}>{rotulo}</Texto>
      <TextInput
        accessibilityLabel={rotulo}
        placeholderTextColor={cores.textoSecundario}
        editable={editable}
        style={[
          estilos.input,
          { borderColor: cores.borda, backgroundColor: cores.fundo, color: cores.textoPrincipal },
          !editable && estilos.somenteLeitura,
          style,
        ]}
        {...props}
      />
      {ajuda && <Texto tamanho={12} cor="textoSecundario" style={estilos.ajuda}>{ajuda}</Texto>}
    </View>
  );
}

/** Linha com título, descrição opcional e um Switch. */
export function Alternador({ rotulo, descricao, valor, onChange, desabilitado }: {
  rotulo: string; descricao?: string; valor: boolean; onChange: (valor: boolean) => void; desabilitado?: boolean;
}) {
  const cores = useCores();
  return (
    <View style={estilos.linhaAlternador}>
      <View style={estilos.flex}>
        <Texto peso={500}>{rotulo}</Texto>
        {descricao && <Texto tamanho={13} cor="textoSecundario">{descricao}</Texto>}
      </View>
      <Switch
        accessibilityLabel={rotulo}
        value={valor}
        onValueChange={onChange}
        disabled={desabilitado}
        trackColor={{ false: cores.borda, true: cores.brand }}
        thumbColor={cores.superficie}
      />
    </View>
  );
}

/** Rodapé com o estado do formulário e os botões Cancelar / Salvar. */
export function RodapeSalvar({ mensagem, erro, salvando, podeSalvar, rotuloSalvar = 'Salvar alterações', onCancelar, onSalvar }: {
  mensagem: string; erro: string | null; salvando: boolean; podeSalvar: boolean; rotuloSalvar?: string;
  onCancelar: () => void; onSalvar: () => void;
}) {
  return (
    <View style={estilos.rodapeAcoes}>
      <Texto tamanho={13} cor={erro ? 'feedbackErro' : 'textoSecundario'} accessibilityRole={erro ? 'alert' : undefined} style={estilos.flex}>
        {erro ?? mensagem}
      </Texto>
      {podeSalvar && (
        <View style={estilos.linhaBotoes}>
          <Botao rotulo="Cancelar" disabled={salvando} onPress={onCancelar} />
          <Botao rotulo={salvando ? 'Salvando…' : rotuloSalvar} icone="salvar" variante="primario" disabled={salvando} onPress={onSalvar} />
        </View>
      )}
    </View>
  );
}

/** Coluna principal + lateral (empilhadas em telas estreitas). */
export function Colunas({ emColunas, principal, lateral }: { emColunas: boolean; principal: ReactNode; lateral: ReactNode }) {
  return (
    <View style={[estilos.layoutColunas, !emColunas && estilos.layoutEmpilhado]}>
      <View style={estilos.colunaPrincipal}>{principal}</View>
      <View style={emColunas ? estilos.colunaLateral : estilos.pilha}>{lateral}</View>
    </View>
  );
}

/** "12,5" -> 12.5; vazio -> null. */
export function lerNumero(texto: string) {
  const limpo = texto.trim().replace(',', '.');
  if (!limpo) return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : NaN;
}

export function formatarNumero(valor: number | null) {
  return valor === null ? '' : String(valor).replace('.', ',');
}

export const estilos = StyleSheet.create({
  flex: { flex: 1 },
  layoutColunas: { flexDirection: 'row', alignItems: 'flex-start', gap: Espacamento.large },
  layoutEmpilhado: { flexDirection: 'column', alignItems: 'stretch' },
  colunaPrincipal: { flex: 1, gap: Espacamento.large },
  colunaLateral: { width: 320, gap: Espacamento.large },
  pilha: { gap: Espacamento.large },
  cartaoForm: { gap: Espacamento.large },
  cartaoLateral: { gap: Espacamento.medium },
  label: { marginBottom: Espacamento.xsmall },
  ajuda: { marginTop: 4 },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: Raio.small,
    paddingHorizontal: Espacamento.medium,
    fontFamily: Fonts?.sans,
    fontSize: 14,
  },
  somenteLeitura: { opacity: 0.7 },
  linhaDupla: { flexDirection: 'row', flexWrap: 'wrap', gap: Espacamento.medium },
  linhaAlternador: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
    paddingVertical: Espacamento.xsmall,
  },
  rodapeAcoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
    paddingVertical: Espacamento.small,
  },
  linhaBotoes: { flexDirection: 'row', gap: Espacamento.medium },
  linhaUsuario: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espacamento.medium,
    paddingVertical: Espacamento.small,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Espacamento.small },
});
