import { useState } from 'react';
import { View } from 'react-native';

import { Alternador, CampoTexto, Colunas, RodapeSalvar, estilos } from './campos';
import { Aviso, Cartao, Texto } from '@/components/dashboard/ui';
import { usePerfil } from '@/data/perfil-context';
import type { ConfiguracoesRestaurante, Restaurante } from '@/services/api-conta';

type Preferencias = Required<NonNullable<ConfiguracoesRestaurante['preferencias']>>;

const PADRAO: Preferencias = {
  baixaAutomatica: true,
  indisponivelZero: true,
  alertasEstoqueBaixo: true,
  limiteAlerta: '5 unidades',
  unidadePadrao: 'Unidade (un.)',
  notifNovosPedidos: true,
  notifFalhasSync: true,
  notifEstoqueBaixo: true,
  notifSom: true,
  notifResumoDiario: false,
  emailAvisos: '',
};

const doRestaurante = (r: Restaurante): Preferencias => ({ ...PADRAO, ...r.configuracoes.preferencias });

/** Preferências de estoque e notificações, guardadas em Restaurante.configuracoes.preferencias. */
export function AbaPreferencias({ restaurante, emColunas }: { restaurante: Restaurante; emColunas: boolean }) {
  const { atualizarRestaurante, podeEditarRestaurante: podeEditar } = usePerfil();
  const [form, setForm] = useState<Preferencias>(() => doRestaurante(restaurante));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const campo = <K extends keyof Preferencias>(chave: K) => (valor: Preferencias[K]) => {
    setForm((atual) => ({ ...atual, [chave]: valor }));
    setSalvo(false);
  };

  const salvar = async () => {
    setSalvando(true); setErro(null);
    try {
      const atualizado = await atualizarRestaurante({ configuracoes: { preferencias: form } });
      setForm(doRestaurante(atualizado));
      setSalvo(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const principal = (
    <>
      <Cartao style={estilos.cartaoForm}>
        <Texto accessibilityRole="header" tamanho={18} peso={600}>Preferências de estoque</Texto>
        <Texto tamanho={13} cor="textoSecundario">Defina os cuidados que fazem parte da sua rotina.</Texto>
        <Alternador rotulo="Baixa automática por pedido" descricao="Reduzir o saldo do estoque central a cada pedido aceito."
          valor={form.baixaAutomatica} onChange={campo('baixaAutomatica')} desabilitado={!podeEditar} />
        <Alternador rotulo="Indisponível ao chegar a zero" descricao="Atualizar a disponibilidade nos canais conectados para evitar overselling."
          valor={form.indisponivelZero} onChange={campo('indisponivelZero')} desabilitado={!podeEditar} />
        <Alternador rotulo="Alertas de estoque baixo" descricao="Avisar quando o saldo chegar ao limite definido."
          valor={form.alertasEstoqueBaixo} onChange={campo('alertasEstoqueBaixo')} desabilitado={!podeEditar} />
        <View style={estilos.linhaDupla}>
          <CampoTexto flex={1} rotulo="Limite padrão para alerta" value={form.limiteAlerta} onChangeText={campo('limiteAlerta')} editable={podeEditar} />
          <CampoTexto flex={1} rotulo="Unidade padrão" value={form.unidadePadrao} onChangeText={campo('unidadePadrao')} editable={podeEditar} />
        </View>
      </Cartao>
      <Aviso
        icone="info"
        titulo="Preferências salvas para o restaurante"
        texto="Valem para toda a equipe. Por enquanto o estoque já é baixado ao aceitar o pedido; os alertas e as notificações ainda não são enviados automaticamente."
      />
      <RodapeSalvar
        mensagem={!podeEditar ? 'Somente administradores e gerentes alteram as preferências.' : salvo ? '✓ Preferências salvas.' : 'Revise antes de salvar.'}
        erro={erro}
        salvando={salvando}
        podeSalvar={podeEditar}
        rotuloSalvar="Salvar preferências"
        onCancelar={() => { setForm(doRestaurante(restaurante)); setErro(null); setSalvo(false); }}
        onSalvar={salvar}
      />
    </>
  );

  const lateral = (
    <Cartao style={estilos.cartaoLateral}>
      <Texto accessibilityRole="header" tamanho={18} peso={600}>Notificações</Texto>
      <Texto tamanho={13} cor="textoSecundario">Escolha quais avisos ajudam a sua equipe durante o serviço.</Texto>
      <Alternador rotulo="Novos pedidos" valor={form.notifNovosPedidos} onChange={campo('notifNovosPedidos')} desabilitado={!podeEditar} />
      <Alternador rotulo="Falhas de sincronização" valor={form.notifFalhasSync} onChange={campo('notifFalhasSync')} desabilitado={!podeEditar} />
      <Alternador rotulo="Estoque baixo ou esgotado" valor={form.notifEstoqueBaixo} onChange={campo('notifEstoqueBaixo')} desabilitado={!podeEditar} />
      <Alternador rotulo="Som de novos pedidos" valor={form.notifSom} onChange={campo('notifSom')} desabilitado={!podeEditar} />
      <Alternador rotulo="Resumo diário por e-mail" valor={form.notifResumoDiario} onChange={campo('notifResumoDiario')} desabilitado={!podeEditar} />
      <CampoTexto rotulo="E-mail para avisos" value={form.emailAvisos} onChangeText={campo('emailAvisos')} keyboardType="email-address" autoCapitalize="none" editable={podeEditar} />
    </Cartao>
  );

  return <Colunas emColunas={emColunas} principal={principal} lateral={lateral} />;
}
