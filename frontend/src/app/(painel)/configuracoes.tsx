import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AbaEstabelecimento } from '@/components/configuracoes/aba-estabelecimento';
import { AbaIntegracoes } from '@/components/configuracoes/aba-integracoes';
import { AbaPreferencias } from '@/components/configuracoes/aba-preferencias';
import { AbaUsuarios } from '@/components/configuracoes/aba-usuarios';
import { estilos } from '@/components/configuracoes/campos';
import { Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import { Botao, Cartao, Chip, Divisor, Etiqueta, Texto } from '@/components/dashboard/ui';
import { usePerfil } from '@/data/perfil-context';
import { useSessao } from '@/data/sessao';
import { Espacamento } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';

type AbaConfiguracao = 'estabelecimento' | 'usuarios' | 'integracoes' | 'preferencias' | 'assinatura';

const ABAS: { id: AbaConfiguracao; rotulo: string; somenteAdministrador?: boolean }[] = [
  { id: 'estabelecimento', rotulo: 'Estabelecimento' },
  { id: 'usuarios', rotulo: 'Usuários e permissões', somenteAdministrador: true },
  { id: 'integracoes', rotulo: 'Integrações' },
  { id: 'preferencias', rotulo: 'Preferências' },
  { id: 'assinatura', rotulo: 'Assinatura' },
];

const TITULOS: Record<AbaConfiguracao, { titulo: string; subtitulo: string }> = {
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
    subtitulo: 'Acompanhe os pedidos que chegam de cada canal.',
  },
  preferencias: {
    titulo: 'Preferências',
    subtitulo: 'Ajuste o comportamento do estoque e os avisos da sua operação.',
  },
  assinatura: {
    titulo: 'Assinatura',
    subtitulo: 'Gerencie seu plano, pagamentos e dados de cobrança.',
  },
};

export default function Configuracoes() {
  const cores = useCores();
  const larguraConteudo = useLarguraConteudo();
  const emColunas = larguraConteudo >= 980;
  const { usuario } = useSessao();
  const { restaurante, erro } = usePerfil();

  const abas = ABAS.filter((aba) => !aba.somenteAdministrador || usuario?.papel === 'administrador');
  const [abaAtiva, setAbaAtiva] = useState<AbaConfiguracao>('estabelecimento');

  return (
    <Pagina titulo={TITULOS[abaAtiva].titulo} subtitulo={TITULOS[abaAtiva].subtitulo}>
      {/* Abas */}
      <View style={estilos.chips}>
        {abas.map(({ id, rotulo }) => (
          <Chip key={id} rotulo={rotulo} ativo={abaAtiva === id} onPress={() => setAbaAtiva(id)} />
        ))}
      </View>

      {erro && <Texto cor="feedbackErro" accessibilityRole="alert">{erro}</Texto>}
      {!restaurante && !erro && <ActivityIndicator color={cores.textoPrincipal} />}

      {/* As abas com formulário recebem o restaurante já carregado e montam seu estado a partir dele */}
      {restaurante && abaAtiva === 'estabelecimento' && <AbaEstabelecimento restaurante={restaurante} emColunas={emColunas} />}
      {restaurante && abaAtiva === 'usuarios' && <AbaUsuarios emColunas={emColunas} nomeRestaurante={restaurante.nome} />}
      {abaAtiva === 'integracoes' && <AbaIntegracoes />}
      {restaurante && abaAtiva === 'preferencias' && <AbaPreferencias restaurante={restaurante} emColunas={emColunas} />}

      {/* ABA 5: ASSINATURA */}
      {abaAtiva === 'assinatura' && (
        <View style={[estilos.layoutColunas, !emColunas && estilos.layoutEmpilhado]}>
          <View style={estilos.colunaPrincipal}>
            <Cartao style={estilos.cartaoForm}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: Espacamento.small }}>
                <View style={{ gap: 4 }}>
                  <Texto accessibilityRole="header" tamanho={18} peso={600}>
                    Plano atual
                  </Texto>
                  <Texto tamanho={13} cor="textoSecundario">
                    Seu estabelecimento possui acesso completo à plataforma.
                  </Texto>
                </View>
                <Etiqueta rotulo="Plano ativo" corPonto={cores.statusEntregue} />
              </View>

              <Divisor />

              <View style={{ gap: Espacamento.small }}>
                <Texto tamanho={22} peso={700}>
                  Gerêncio • Essencial
                </Texto>
                <Texto tamanho={18} peso={600} cor="brand">
                  R$ 149,00 / mês
                </Texto>
                <Texto tamanho={13} cor="textoSecundario">
                  Próxima renovação em 10 nov. 2026.
                </Texto>
              </View>

              <View style={{ gap: Espacamento.xsmall }}>
                <Texto tamanho={13} cor="textoSecundario">✓ 1 unidade + 5 usuários</Texto>
                <Texto tamanho={13} cor="textoSecundario">✓ Itens ilimitados</Texto>
                <Texto tamanho={13} cor="textoSecundario">✓ Fichas técnicas e fornecedores</Texto>
                <Texto tamanho={13} cor="textoSecundario">✓ Relatórios completos</Texto>
              </View>

              <Divisor />

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Espacamento.medium }}>
                <Botao
                  rotulo="Ir para dados de pagamento"
                  icone="cartao"
                  variante="primario"
                  onPress={() => router.push('/assinatura/pagamento' as any)}
                />
              </View>
            </Cartao>

            <Cartao style={estilos.cartaoForm}>
              <Texto accessibilityRole="header" tamanho={18} peso={600}>
                Histórico de cobranças
              </Texto>
              <Texto tamanho={13} cor="textoSecundario">
                Consulte e baixe seus comprovantes anteriores.
              </Texto>

              <View style={estilos.linhaUsuario}>
                <View style={{ flex: 1 }}>
                  <Texto tamanho={15} peso={600}>GER-2026-1048 • R$ 149,00</Texto>
                  <Texto tamanho={13} cor="textoSecundario">11 out. 2026 • Pix confirmado</Texto>
                </View>
                <Botao
                  rotulo="Ver comprovante"
                  icone="baixar"
                  onPress={() => router.push('/assinatura/pagamento' as any)}
                />
              </View>
            </Cartao>
          </View>

          <View style={estilos.colunaLateral}>
            <Cartao style={estilos.cartaoLateral}>
              <Texto accessibilityRole="header" tamanho={18} peso={600}>
                Dúvidas sobre cobrança?
              </Texto>
              <Texto tamanho={13} cor="textoSecundario" style={{ lineHeight: 18 }}>
                Você pode alternar entre Cartão de crédito e Pix a qualquer momento com total segurança.
              </Texto>
              <Botao
                rotulo="Acessar checkout"
                icone="cartao"
                onPress={() => router.push('/assinatura/pagamento' as any)}
              />
            </Cartao>
          </View>
        </View>
      )}
    </Pagina>
  );
}
