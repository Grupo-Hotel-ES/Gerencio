import { Link, router, useLocalSearchParams } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import {
  Botao,
  Cartao,
  Divisor,
  Icone,
  Texto,
} from '@/components/dashboard/ui';
import { Fonts } from '@/constants/theme';
import { Espacamento, Raio } from '@/constants/tokens';
import { useCores } from '@/hooks/use-cores';
import {
  buscarConfigPagamento,
  consultarCheckout,
  criarCheckout,
  resultadoDaSessao,
  type MetodoPagamento,
  type SessaoCheckout,
} from '@/services/api-pagamentos';

type PassoFluxo = 1 | 2 | 3;
type EtapaPagamento = 'processando' | 'aguardando_pix' | 'sucesso' | 'falha';

// No celular o Stripe não volta para o app: a página de retorno é a versão web.
const URL_RETORNO_NATIVO =
  process.env.EXPO_PUBLIC_URL_RETORNO_PAGAMENTO ?? 'http://localhost:8081/assinatura/pagamento';

function urlDeRetorno() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return URL_RETORNO_NATIVO;
}

const CODIGO_PIX_EXEMPLO =
  '000201-GERENCIO-DEMONSTRACAO-SEM-VALOR-14900-GER20261048';

/** Representação gráfica limpa e precisa do QR Code Pix demonstrativo. */
function QRCodePixVisual() {
  const cores = useCores();

  // Matriz simplificada 21x21 para renderizar o QR code de forma nítida em qualquer plataforma
  const matriz: number[][] = [
    [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0],
    [0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1],
    [1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1],
    [0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0],
    [1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 1, 1],
  ];

  return (
    <View style={styles.qrContainer}>
      <View style={[styles.qrMoldura, { borderColor: cores.borda }]}>
        {matriz.map((linha, rIdx) => (
          <View key={`r-${rIdx}`} style={styles.qrLinha}>
            {linha.map((celula, cIdx) => (
              <View
                key={`c-${cIdx}`}
                style={[
                  styles.qrModulo,
                  { backgroundColor: celula ? cores.textoPrincipal : cores.superficie },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function PagamentoAssinatura() {
  const cores = useCores();
  const larguraConteudo = useLarguraConteudo();
  const emColunas = larguraConteudo >= 980;
  const parametros = useLocalSearchParams<{ sessao?: string; cancelado?: string }>();

  // Estado geral do fluxo (na volta do Stripe, começa no passo correspondente)
  const [passo, setPasso] = useState<PassoFluxo>(
    parametros.sessao ? 3 : parametros.cancelado ? 2 : 1,
  );
  const [metodo, setMetodo] = useState<MetodoPagamento>('cartao');
  const [etapaPagamento, setEtapaPagamento] = useState<EtapaPagamento>(
    parametros.sessao ? 'processando' : 'aguardando_pix',
  );

  // Stripe: sem chaves no backend (ou sem api-pagamentos), a tela fica em modo demonstração
  const [stripeAtivo, setStripeAtivo] = useState(false);
  const [sessao, setSessao] = useState<SessaoCheckout | null>(null);
  const [urlCheckout, setUrlCheckout] = useState<string | null>(null);
  const [erroPagamento, setErroPagamento] = useState<string | null>(
    parametros.cancelado ? 'Pagamento cancelado. Nenhum valor foi cobrado.' : null,
  );
  const [verificando, setVerificando] = useState(Boolean(parametros.sessao));

  // Dados do cartão
  const [numeroCartao, setNumeroCartao] = useState('4242 4242 4242 4242');
  const [validade, setValidade] = useState('12/29');
  const [cvc, setCvc] = useState('•••');
  const [nomeCartao, setNomeCartao] = useState('Marina Almeida');

  // Identificação e cobrança
  const [responsavel, setResponsavel] = useState('Marina Almeida');
  const [estabelecimento, setEstabelecimento] = useState('Vila Bistrô');
  const [emailCobranca, setEmailCobranca] = useState('marina@vilabistro.com.br');
  const [razaoSocial, setRazaoSocial] = useState('Vila Bistrô Alimentação Ltda.');
  const [cnpj, setCnpj] = useState('12.345.678/0001-90');
  const [logradouro, setLogradouro] = useState('Rua das Palmeiras, 120 • Loja 2');
  const [cidadeUfCep, setCidadeUfCep] = useState('Centro • São Paulo / SP • CEP 01001-000');
  const [editandoEndereco, setEditandoEndereco] = useState(false);

  // Estados interativos do Pix
  const [copiado, setCopiado] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(1800); // 30 minutos

  useEffect(() => {
    buscarConfigPagamento().then((config) => setStripeAtivo(config?.configurado ?? false));
  }, []);

  /** Consulta a sessão no Stripe e leva a tela para a etapa correspondente. */
  const verificarPagamento = useCallback(
    (id: string) =>
      consultarCheckout(id)
        .then((atual) => {
          setSessao(atual);
          if (atual.metodo) setMetodo(atual.metodo);
          const resultado = resultadoDaSessao(atual);
          if (resultado === 'sucesso') {
            setPasso(3);
            setEtapaPagamento('sucesso');
          } else if (resultado === 'falha') {
            setPasso(3);
            setEtapaPagamento('falha');
          } else if (atual.metodo === 'pix') {
            setPasso(3);
            setEtapaPagamento('aguardando_pix');
          } else {
            setPasso(2);
            setErroPagamento('O pagamento não foi concluído. Revise os dados e tente novamente.');
          }
        })
        .catch((erro) => {
          setPasso(2);
          setErroPagamento(erro instanceof Error ? erro.message : 'Não foi possível consultar o pagamento.');
        })
        .finally(() => setVerificando(false)),
    [],
  );

  // Volta do Stripe Checkout com ?sessao=cs_... (o ?cancelado=1 já define o estado inicial)
  useEffect(() => {
    if (parametros.sessao) verificarPagamento(parametros.sessao);
  }, [parametros.sessao, verificarPagamento]);

  // Contador regressivo para o Pix
  useEffect(() => {
    if (passo === 3 && etapaPagamento === 'aguardando_pix' && segundosRestantes > 0) {
      const timer = setInterval(() => {
        setSegundosRestantes((s) => Math.max(0, s - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [passo, etapaPagamento, segundosRestantes]);

  const minutosFormatados = Math.floor(segundosRestantes / 60)
    .toString()
    .padStart(2, '0');
  const segundosFormatados = (segundosRestantes % 60).toString().padStart(2, '0');

  const copiarPix = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(CODIGO_PIX_EXEMPLO);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const iniciarPagamento = async () => {
    setPasso(3);
    setEtapaPagamento('processando');
    setErroPagamento(null);

    if (stripeAtivo) {
      try {
        const checkout = await criarCheckout({
          metodo,
          email: emailCobranca,
          urlRetorno: urlDeRetorno(),
          estabelecimento,
          razaoSocial,
          cnpj,
          responsavel,
        });
        setUrlCheckout(checkout.url);
        if (Platform.OS === 'web') {
          // O Stripe redireciona de volta com ?sessao=... (tratado no efeito acima)
          window.location.assign(checkout.url);
          return;
        }
        await openBrowserAsync(checkout.url);
        await verificarPagamento(checkout.id);
      } catch (erro) {
        setPasso(2);
        setErroPagamento(erro instanceof Error ? erro.message : 'Não foi possível iniciar o pagamento.');
      }
      return;
    }

    setTimeout(() => {
      if (metodo === 'pix') {
        setEtapaPagamento('aguardando_pix');
      } else {
        setEtapaPagamento('sucesso');
      }
    }, 1800);
  };

  const estiloCampo = [
    styles.input,
    { borderColor: cores.borda, backgroundColor: cores.fundo, color: cores.textoPrincipal },
  ];

  // Componente do Card Lateral de Assinatura (renderizado em 2 colunas no desktop ou empilhado no mobile)
  const renderCardSuaAssinatura = () => (
    <View style={styles.colunaLateral}>
      <Cartao style={styles.cartaoLateral}>
        <Texto accessibilityRole="header" tamanho={18} peso={600}>
          Sua assinatura
        </Texto>
        <Texto tamanho={16} peso={500}>
          Gerêncio • Essencial
        </Texto>
        <Texto tamanho={28} peso={700}>
          R$ 149 / mês
        </Texto>

        <View style={styles.listaBeneficios}>
          <Texto tamanho={13} cor="textoSecundario">
            ✓ 1 unidade + 5 usuários
          </Texto>
          <Texto tamanho={13} cor="textoSecundario">
            ✓ Itens ilimitados
          </Texto>
          <Texto tamanho={13} cor="textoSecundario">
            ✓ Fichas técnicas e fornecedores
          </Texto>
          <Texto tamanho={13} cor="textoSecundario">
            ✓ Relatórios completos
          </Texto>
        </View>

        <Divisor />

        <View style={styles.linhaTotal}>
          <Texto peso={600}>
            {passo === 3 && etapaPagamento === 'sucesso' ? 'Total pago' : 'Total a pagar'}
          </Texto>
          <Texto tamanho={18} peso={700}>
            R$ 149,00
          </Texto>
        </View>

        <Texto tamanho={12} cor="textoSecundario" style={{ lineHeight: 18 }}>
          {metodo === 'cartao'
            ? 'Cobrança mensal no cartão. Sem taxas adicionais.'
            : 'Pagamento de um período mensal. Sem débito automático.'}
        </Texto>
      </Cartao>

      <Cartao style={styles.cartaoLateral}>
        <View style={styles.linhaCabecalhoAmbiente}>
          <Icone nome="escudo" tamanho={22} cor={cores.textoPrincipal} />
          <Texto peso={600}>Ambiente seguro</Texto>
        </View>
        <Texto tamanho={13} cor="textoSecundario">
          Seus dados são transmitidos com criptografia.
        </Texto>
      </Cartao>
    </View>
  );

  // Título e subtítulo dinâmicos da página
  let tituloPagina = 'Dados de pagamento';
  let subtituloPagina =
    metodo === 'cartao'
      ? 'Escolha como pagar a assinatura do Gerêncio.'
      : 'Pague um período mensal com Pix, sem cartão.';

  if (passo === 2) {
    tituloPagina = 'Resumo do pedido';
    subtituloPagina = 'Revise a assinatura e os dados antes de gerar o pagamento.';
  } else if (passo === 3) {
    if (etapaPagamento === 'processando') {
      tituloPagina = 'Processando pagamento';
      subtituloPagina = 'Estamos preparando seu pagamento com segurança.';
    } else if (etapaPagamento === 'aguardando_pix') {
      tituloPagina = 'Aguardando pagamento Pix';
      subtituloPagina = 'Pague no aplicativo do banco para ativar sua assinatura.';
    } else if (etapaPagamento === 'sucesso') {
      tituloPagina = 'Pagamento confirmado';
      subtituloPagina = 'Tudo certo! A assinatura do Vila Bistrô está ativa.';
    } else if (etapaPagamento === 'falha') {
      tituloPagina = 'Não foi possível pagar';
      subtituloPagina = 'Você pode revisar os dados ou escolher outro método.';
    }
  }

  return (
    <Pagina titulo={tituloPagina} subtitulo={subtituloPagina}>
      {/* Breadcrumb de navegação */}
      <View style={styles.breadcrumb}>
        <Link href="/configuracoes" asChild>
          <Pressable>
            <Texto tamanho={13} cor="textoSecundario">
              Configurações / Assinatura / Pagamento
            </Texto>
          </Pressable>
        </Link>
      </View>

      {/* Stepper (1 Dados -> 2 Revisão -> 3 Pagamento) */}
      <Cartao style={styles.stepperContainer}>
        <Pressable
          onPress={() => setPasso(1)}
          style={styles.itemPasso}>
          <View
            style={[
              styles.circuloPasso,
              { backgroundColor: cores.brand },
            ]}>
            <Texto peso={700} cor="textOnBrand">
              {passo > 1 ? '✓' : '1'}
            </Texto>
          </View>
          <Texto peso={passo === 1 ? 600 : 500}>Dados</Texto>
        </Pressable>

        <Pressable
          onPress={() => setPasso(2)}
          disabled={passo < 2}
          style={styles.itemPasso}>
          <View
            style={[
              styles.circuloPasso,
              {
                backgroundColor:
                  passo === 2
                    ? cores.brand
                    : passo > 2
                    ? cores.brand
                    : cores.borda,
              },
            ]}>
            <Texto
              peso={700}
              cor={passo >= 2 ? 'textOnBrand' : 'textoSecundario'}>
              {passo > 2 ? '✓' : '2'}
            </Texto>
          </View>
          <Texto
            peso={passo === 2 ? 600 : 500}
            cor={passo >= 2 ? 'textoPrincipal' : 'textoSecundario'}>
            Revisão
          </Texto>
        </Pressable>

        <View style={styles.itemPasso}>
          <View
            style={[
              styles.circuloPasso,
              {
                backgroundColor:
                  passo === 3 && etapaPagamento === 'sucesso'
                    ? cores.statusEntregue
                    : passo === 3
                    ? cores.brand
                    : cores.borda,
              },
            ]}>
            <Texto
              peso={700}
              cor={
                passo === 3 && etapaPagamento === 'sucesso'
                  ? 'textoSecundario2'
                  : passo === 3
                  ? 'textOnBrand'
                  : 'textoSecundario'
              }>
              {passo === 3 && etapaPagamento === 'sucesso' ? '✓' : '3'}
            </Texto>
          </View>
          <Texto
            peso={passo === 3 ? 600 : 500}
            cor={passo === 3 ? 'textoPrincipal' : 'textoSecundario'}>
            Pagamento
          </Texto>
        </View>
      </Cartao>

      {/* No layout mobile, o card de assinatura fica logo abaixo do stepper */}
      {!emColunas && renderCardSuaAssinatura()}

      <View style={[styles.layoutColunas, !emColunas && styles.layoutEmpilhado]}>
        {/* Coluna Principal da Página */}
        <View style={styles.colunaPrincipal}>
          {/* PASSO 1: DADOS DE PAGAMENTO */}
          {passo === 1 && (
            <>
              {/* Card Seleção do Método */}
              <Cartao style={styles.cartaoSecao}>
                <Texto accessibilityRole="header" tamanho={18} peso={600}>
                  Método de pagamento
                </Texto>

                <View style={styles.linhaMetodos}>
                  {/* Opção: Cartão de Crédito */}
                  <Pressable
                    onPress={() => setMetodo('cartao')}
                    style={[
                      styles.opcaoMetodo,
                      {
                        borderColor: metodo === 'cartao' ? cores.brand : cores.borda,
                        backgroundColor: metodo === 'cartao' ? cores.fundo2 : cores.superficie,
                      },
                    ]}>
                    <View style={styles.metodoConteudo}>
                      <Icone nome="cartao" tamanho={22} cor={cores.textoPrincipal} />
                      <Texto peso={600}>Cartão de crédito</Texto>
                    </View>
                    <View
                      style={[
                        styles.radioCirculo,
                        { borderColor: metodo === 'cartao' ? cores.brand : cores.borda },
                      ]}>
                      {metodo === 'cartao' && (
                        <View style={[styles.radioPonto, { backgroundColor: cores.textoPrincipal }]} />
                      )}
                    </View>
                  </Pressable>

                  {/* Opção: Pix */}
                  <Pressable
                    onPress={() => setMetodo('pix')}
                    style={[
                      styles.opcaoMetodo,
                      {
                        borderColor: metodo === 'pix' ? cores.brand : cores.borda,
                        backgroundColor: metodo === 'pix' ? cores.fundo2 : cores.superficie,
                      },
                    ]}>
                    <View style={styles.metodoConteudo}>
                      <Icone nome="pix" tamanho={22} cor={cores.textoPrincipal} />
                      <Texto peso={600}>Pix</Texto>
                    </View>
                    <View
                      style={[
                        styles.radioCirculo,
                        { borderColor: metodo === 'pix' ? cores.brand : cores.borda },
                      ]}>
                      {metodo === 'pix' && (
                        <View style={[styles.radioPonto, { backgroundColor: cores.textoPrincipal }]} />
                      )}
                    </View>
                  </Pressable>
                </View>

                {/* Conteúdo específico: Cartão */}
                {metodo === 'cartao' && stripeAtivo && (
                  <View style={styles.blocoCampos}>
                    <Cartao style={[styles.avisoCaixa, { backgroundColor: cores.fundo }]}>
                      <Icone nome="cadeado" tamanho={20} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Texto peso={600}>Dados do cartão na página segura do Stripe</Texto>
                        <Texto tamanho={13} cor="textoSecundario">
                          Depois da revisão, você será levado ao Stripe para informar o cartão. O Gerêncio não recebe nem armazena o número ou o código de segurança.
                        </Texto>
                      </View>
                    </Cartao>
                  </View>
                )}

                {metodo === 'cartao' && !stripeAtivo && (
                  <View style={styles.blocoCampos}>
                    <Texto tamanho={12} cor="textoSecundario">
                      * Campos obrigatórios. Dados de teste, sem valor real.
                    </Texto>

                    <View>
                      <Texto tamanho={13} peso={500} style={styles.label}>
                        Número do cartão *
                      </Texto>
                      <TextInput
                        value={numeroCartao}
                        onChangeText={setNumeroCartao}
                        style={estiloCampo}
                      />
                      <Texto tamanho={12} cor="textoSecundario" style={styles.dicaCampo}>
                        Informe os 16 dígitos do cartão, sem letras.
                      </Texto>
                    </View>

                    <View style={styles.linhaDupla}>
                      <View style={styles.campoFlex}>
                        <Texto tamanho={13} peso={500} style={styles.label}>
                          Validade *
                        </Texto>
                        <TextInput
                          value={validade}
                          onChangeText={setValidade}
                          style={estiloCampo}
                        />
                        <Texto tamanho={12} cor="textoSecundario" style={styles.dicaCampo}>
                          MM/AA • data futura
                        </Texto>
                      </View>
                      <View style={styles.campoFlex}>
                        <Texto tamanho={13} peso={500} style={styles.label}>
                          Código de segurança *
                        </Texto>
                        <TextInput
                          value={cvc}
                          onChangeText={setCvc}
                          style={estiloCampo}
                        />
                        <Texto tamanho={12} cor="textoSecundario" style={styles.dicaCampo}>
                          3 ou 4 dígitos (CVC)
                        </Texto>
                      </View>
                    </View>

                    <View>
                      <Texto tamanho={13} peso={500} style={styles.label}>
                        Nome no cartão *
                      </Texto>
                      <TextInput
                        value={nomeCartao}
                        onChangeText={setNomeCartao}
                        style={estiloCampo}
                      />
                      <Texto tamanho={12} cor="textoSecundario" style={styles.dicaCampo}>
                        Digite exatamente como aparece no cartão.
                      </Texto>
                    </View>

                    <Cartao style={[styles.avisoCaixa, { backgroundColor: cores.fundo }]}>
                      <Icone nome="cadeado" tamanho={20} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Texto peso={600}>Seus dados protegidos</Texto>
                        <Texto tamanho={13} cor="textoSecundario">
                          O código de segurança não será armazenado. Confira número, validade e CVC antes de continuar.
                        </Texto>
                      </View>
                    </Cartao>
                  </View>
                )}

                {/* Conteúdo específico: Pix */}
                {metodo === 'pix' && (
                  <View style={styles.blocoCampos}>
                    <Texto peso={600}>O código Pix será gerado após a revisão</Texto>
                    <Texto tamanho={13} cor="textoSecundario" style={{ lineHeight: 18 }}>
                      Confira os dados de cobrança abaixo. Na próxima etapa, revise o pedido e selecione "Gerar Pix de R$ 149,00".
                    </Texto>

                    <Cartao style={[styles.avisoCaixa, { backgroundColor: cores.fundo }]}>
                      <Icone nome="pix" tamanho={22} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Texto peso={600}>Um pagamento, um mês de acesso</Texto>
                        <Texto tamanho={13} cor="textoSecundario">
                          Você terá 30 minutos para pagar pelo QR Code ou pelo código copia e cola. O plano é ativado após a confirmação.
                        </Texto>
                      </View>
                    </Cartao>

                    <Texto tamanho={12} cor="textoSecundario">
                      Pix não autoriza débitos automáticos. Para o próximo período, será necessário realizar um novo pagamento.
                    </Texto>
                  </View>
                )}
              </Cartao>

              {/* Card Identificação de Cobrança */}
              <Cartao style={styles.cartaoSecao}>
                <Texto accessibilityRole="header" tamanho={18} peso={600}>
                  Identificação de cobrança
                </Texto>
                <Texto tamanho={12} cor="textoSecundario">
                  * Campos obrigatórios. Confira os dados para o comprovante.
                </Texto>

                <View style={styles.linhaDupla}>
                  <View style={styles.campoFlex}>
                    <Texto tamanho={13} peso={500} style={styles.label}>
                      Responsável *
                    </Texto>
                    <TextInput
                      value={responsavel}
                      onChangeText={setResponsavel}
                      style={estiloCampo}
                    />
                  </View>
                  <View style={styles.campoFlex}>
                    <Texto tamanho={13} peso={500} style={styles.label}>
                      Estabelecimento *
                    </Texto>
                    <TextInput
                      value={estabelecimento}
                      onChangeText={setEstabelecimento}
                      style={estiloCampo}
                    />
                  </View>
                </View>

                <View>
                  <Texto tamanho={13} peso={500} style={styles.label}>
                    E-mail de cobrança *
                  </Texto>
                  <TextInput
                    value={emailCobranca}
                    onChangeText={setEmailCobranca}
                    keyboardType="email-address"
                    style={estiloCampo}
                  />
                  <Texto tamanho={12} cor="textoSecundario" style={styles.dicaCampo}>
                    Enviaremos o comprovante para este e-mail.
                  </Texto>
                </View>

                <View style={styles.linhaDupla}>
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
                  <View style={styles.campoFlex}>
                    <Texto tamanho={13} peso={500} style={styles.label}>
                      CNPJ *
                    </Texto>
                    <TextInput
                      value={cnpj}
                      onChangeText={setCnpj}
                      style={estiloCampo}
                    />
                  </View>
                </View>

                {/* Seção Endereço de Cobrança */}
                <View style={styles.secaoEndereco}>
                  <Texto tamanho={13} cor="textoSecundario">
                    Endereço de cobrança • do cadastro
                  </Texto>
                  {editandoEndereco ? (
                    <View style={{ gap: Espacamento.small }}>
                      <TextInput
                        value={logradouro}
                        onChangeText={setLogradouro}
                        placeholder="Logradouro e número"
                        style={estiloCampo}
                      />
                      <TextInput
                        value={cidadeUfCep}
                        onChangeText={setCidadeUfCep}
                        placeholder="Bairro • Cidade / UF • CEP"
                        style={estiloCampo}
                      />
                      <Botao
                        rotulo="Concluir edição de endereço"
                        onPress={() => setEditandoEndereco(false)}
                      />
                    </View>
                  ) : (
                    <>
                      <Texto peso={600} tamanho={15}>
                        {logradouro}
                      </Texto>
                      <Texto tamanho={13} cor="textoSecundario">
                        {cidadeUfCep}
                      </Texto>
                      <Botao
                        rotulo="Editar endereço de cobrança"
                        icone="editar"
                        onPress={() => setEditandoEndereco(true)}
                        style={{ alignSelf: 'flex-start', marginTop: Espacamento.small }}
                      />
                    </>
                  )}
                </View>
              </Cartao>

              {/* Callout de Mensalidade */}
              {metodo === 'cartao' && (
                <Cartao style={[styles.avisoCaixa, { backgroundColor: cores.superficie }]}>
                  <Icone nome="calendario" tamanho={22} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Texto peso={600}>Mensalidade no cartão</Texto>
                    <Texto tamanho={13} cor="textoSecundario" style={{ lineHeight: 18 }}>
                      R$ 149,00 por mês, com renovação automática. Você pode cancelar em Assinatura antes da próxima renovação. A autorização e os Termos de uso serão revisados antes do pagamento.
                    </Texto>
                  </View>
                </Cartao>
              )}

              {/* Botões de Ação do Passo 1 */}
              <View style={styles.rodapeAcoesFluxo}>
                <Texto tamanho={13} cor="textoSecundario">
                  {metodo === 'cartao'
                    ? 'Você revisará os dados antes de confirmar. Nenhum valor será cobrado agora.'
                    : 'Ao continuar, você apenas revisa o pedido. Nenhum código será gerado ainda.'}
                </Texto>
                <Botao
                  rotulo="Revisar pedido"
                  icone="setaDireita"
                  variante="primario"
                  onPress={() => setPasso(2)}
                />
                <Botao
                  rotulo="Voltar à assinatura"
                  onPress={() => router.push('/configuracoes')}
                />
              </View>
            </>
          )}

          {/* PASSO 2: RESUMO DO PEDIDO */}
          {passo === 2 && (
            <>
              <Cartao style={styles.cartaoSecao}>
                <Texto accessibilityRole="header" tamanho={18} peso={600}>
                  Confira seu pedido
                </Texto>

                {/* Seção Plano */}
                <View style={styles.blocoResumoItem}>
                  <Texto tamanho={12} cor="textoSecundario">
                    Plano
                  </Texto>
                  <Texto tamanho={16} peso={600}>
                    Essencial • assinatura mensal
                  </Texto>
                  <Texto tamanho={13} cor="textoSecundario">
                    1 unidade + 5 usuários • itens ilimitados • fichas técnicas e fornecedores • relatórios completos.
                  </Texto>
                </View>

                <Divisor />

                {/* Seção Estabelecimento e Responsável */}
                <View style={styles.blocoResumoItem}>
                  <Texto tamanho={12} cor="textoSecundario">
                    Estabelecimento
                  </Texto>
                  <Texto tamanho={15} peso={600}>
                    {razaoSocial}
                  </Texto>
                  <Texto tamanho={13} cor="textoSecundario">
                    CNPJ {cnpj}
                  </Texto>

                  <Texto tamanho={12} cor="textoSecundario" style={{ marginTop: Espacamento.small }}>
                    Responsável
                  </Texto>
                  <Texto tamanho={15} peso={600}>
                    {responsavel}
                  </Texto>

                  <Texto tamanho={12} cor="textoSecundario" style={{ marginTop: Espacamento.small }}>
                    E-mail do comprovante
                  </Texto>
                  <Texto tamanho={14} peso={500}>
                    {emailCobranca}
                  </Texto>

                  <Texto tamanho={12} cor="textoSecundario" style={{ marginTop: Espacamento.small }}>
                    Endereço de cobrança
                  </Texto>
                  <Texto tamanho={14} peso={600}>
                    {logradouro}
                  </Texto>
                  <Texto tamanho={13} cor="textoSecundario">
                    {cidadeUfCep}
                  </Texto>
                </View>

                <Divisor />

                {/* Seção Método Escolhido */}
                <View style={styles.blocoResumoItem}>
                  <Texto tamanho={12} cor="textoSecundario">
                    Método de pagamento
                  </Texto>

                  <View style={styles.linhaMetodos}>
                    <View
                      style={[
                        styles.opcaoMetodo,
                        {
                          borderColor: metodo === 'cartao' ? cores.brand : cores.borda,
                          backgroundColor: metodo === 'cartao' ? cores.fundo2 : cores.superficie,
                        },
                      ]}>
                      <View style={styles.metodoConteudo}>
                        <Icone nome="cartao" tamanho={20} />
                        <Texto peso={600}>Cartão de crédito</Texto>
                      </View>
                      <View
                        style={[
                          styles.radioCirculo,
                          { borderColor: metodo === 'cartao' ? cores.brand : cores.borda },
                        ]}>
                        {metodo === 'cartao' && <View style={styles.radioPonto} />}
                      </View>
                    </View>

                    <View
                      style={[
                        styles.opcaoMetodo,
                        {
                          borderColor: metodo === 'pix' ? cores.brand : cores.borda,
                          backgroundColor: metodo === 'pix' ? cores.fundo2 : cores.superficie,
                        },
                      ]}>
                      <View style={styles.metodoConteudo}>
                        <Icone nome="pix" tamanho={20} />
                        <Texto peso={600}>Pix</Texto>
                      </View>
                      <View
                        style={[
                          styles.radioCirculo,
                          { borderColor: metodo === 'pix' ? cores.brand : cores.borda },
                        ]}>
                        {metodo === 'pix' && <View style={styles.radioPonto} />}
                      </View>
                    </View>
                  </View>

                  <Texto tamanho={13} cor="textoSecundario" style={{ marginTop: Espacamento.small }}>
                    {metodo === 'cartao' && stripeAtivo
                      ? 'Os dados do cartão serão informados na página segura do Stripe. No cartão, a cobrança de R$ 149,00 é mensal e recorrente.'
                      : metodo === 'cartao'
                      ? 'Cartão de teste final 4242 disponível. No cartão, a cobrança de R$ 149,00 é mensal e recorrente.'
                      : 'Método escolhido: Pix • pagamento do período mensal. Período: 11 out. a 10 nov. 2026. Sem renovação automática pelo Pix. Acesso liberado após a confirmação.'}
                  </Texto>

                  <Botao
                    rotulo="Alterar dados ou método"
                    icone="editar"
                    onPress={() => setPasso(1)}
                    style={{ alignSelf: 'flex-start', marginTop: Espacamento.small }}
                  />
                </View>
              </Cartao>

              {erroPagamento && (
                <Cartao style={[styles.avisoCaixa, { backgroundColor: cores.fundo }]}>
                  <Icone nome="alerta" tamanho={22} cor={cores.feedbackErro} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Texto peso={600}>Pagamento não iniciado</Texto>
                    <Texto tamanho={13} cor="textoSecundario">
                      {erroPagamento}
                    </Texto>
                  </View>
                </Cartao>
              )}

              {/* Callout Você está no controle */}
              <Cartao style={[styles.avisoCaixa, { backgroundColor: cores.fundo }]}>
                <Icone nome="pix" tamanho={22} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Texto peso={600}>Você está no controle</Texto>
                  <Texto tamanho={13} cor="textoSecundario">
                    {metodo === 'pix'
                      ? 'Gerar o código ainda não conclui o pagamento. Confirme R$ 149,00 no aplicativo do seu banco.'
                      : 'Confirmar agora enviará a solicitação de autorização de R$ 149,00 ao banco.'}
                  </Texto>
                </View>
              </Cartao>

              {/* Botões do Passo 2 */}
              <View style={styles.rodapeAcoesFluxo}>
                <Texto tamanho={12} cor="textoSecundario">
                  Ao continuar, você concorda com os Termos de uso e a Política de privacidade do Gerêncio.
                </Texto>
                <Botao
                  rotulo={metodo === 'pix' ? 'Gerar Pix de R$ 149,00' : 'Confirmar e pagar R$ 149,00'}
                  icone={metodo === 'pix' ? 'pix' : 'setaDireita'}
                  variante="primario"
                  onPress={iniciarPagamento}
                />
                <Botao rotulo="Voltar aos dados" onPress={() => setPasso(1)} />
              </View>
            </>
          )}

          {/* PASSO 3: PAGAMENTO (PROCESSANDO, AGUARDANDO PIX, SUCESSO OU FALHA) */}
          {passo === 3 && (
            <>
              {/* ESTADO 1: PROCESSANDO */}
              {etapaPagamento === 'processando' && (
                <Cartao style={styles.cartaoProcessando}>
                  <View style={[styles.circuloDestaque, { backgroundColor: cores.fundo2 }]}>
                    <ActivityIndicator size="large" color={cores.brand} />
                  </View>

                  <Texto tamanho={22} peso={700}>
                    {metodo === 'pix' ? 'Estamos gerando seu Pix' : 'Estamos processando seu cartão'}
                  </Texto>
                  <Texto tamanho={14} cor="textoSecundario" style={{ textAlign: 'center' }}>
                    Isso pode levar alguns segundos. Não feche esta página e não envie o pedido novamente.
                  </Texto>

                  <Divisor />

                  <View style={styles.blocoDetalheProcessamento}>
                    <Texto tamanho={13} cor="textoSecundario">
                      Pedido
                    </Texto>
                    <Texto peso={600}>GER-2026-1048 • Vila Bistrô</Texto>

                    <Texto tamanho={13} cor="textoSecundario" style={{ marginTop: Espacamento.small }}>
                      Valor do período mensal
                    </Texto>
                    <Texto peso={600}>
                      R$ 149,00 • {metodo === 'pix' ? 'Pix' : 'Cartão de crédito'}
                    </Texto>

                    <View style={styles.listaProgresso}>
                      <Texto tamanho={13} peso={500} cor="statusEntregue">
                        ✓ Dados do pedido conferidos
                      </Texto>
                      <Texto tamanho={13} peso={500} cor="textoSecundario">
                        ⟳ {metodo === 'pix' ? 'Preparando QR Code e código copia e cola' : 'Consultando operadora e autorizando'}
                      </Texto>
                    </View>
                  </View>

                  <Botao rotulo="Processando..." disabled />
                  <Texto tamanho={12} cor="textoSecundario">
                    Envio bloqueado enquanto a solicitação está em andamento.
                  </Texto>

                  <Cartao style={[styles.avisoCaixa, { backgroundColor: cores.fundo }]}>
                    <Icone nome="info" tamanho={20} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Texto peso={600}>Ainda não há pagamento confirmado</Texto>
                      <Texto tamanho={13} cor="textoSecundario">
                        Você só precisa pagar após o código aparecer. Aguarde a atualização desta página.
                      </Texto>
                    </View>
                  </Cartao>
                </Cartao>
              )}

              {/* ESTADO 2 (Stripe): PIX GERADO NO CHECKOUT, AINDA SEM CONFIRMAÇÃO */}
              {etapaPagamento === 'aguardando_pix' && stripeAtivo && (
                <Cartao style={styles.cartaoPix}>
                  <View style={styles.cabecalhoPix}>
                    <Texto tamanho={26} peso={700}>
                      Pix de R$ 149,00
                    </Texto>
                    <Texto tamanho={13} cor="textoSecundario" style={{ textAlign: 'center' }}>
                      O QR Code e o código copia e cola estão na página do Stripe. Depois de pagar no banco, verifique a confirmação aqui.
                    </Texto>
                  </View>

                  <View style={{ gap: Espacamento.medium }}>
                    <Botao
                      rotulo={verificando ? 'Verificando...' : 'Verificar pagamento'}
                      icone="sincronizar"
                      variante="primario"
                      disabled={verificando || !sessao}
                      onPress={() => {
                        if (!sessao) return;
                        setVerificando(true);
                        verificarPagamento(sessao.id);
                      }}
                    />
                    {urlCheckout && (
                      <Botao
                        rotulo="Abrir o Pix novamente"
                        icone="pix"
                        onPress={() => openBrowserAsync(urlCheckout)}
                      />
                    )}
                    <Botao
                      rotulo="Voltar à assinatura"
                      onPress={() => router.push('/configuracoes')}
                    />
                  </View>
                </Cartao>
              )}

              {/* ESTADO 2: AGUARDANDO PAGAMENTO PIX (demonstração) */}
              {etapaPagamento === 'aguardando_pix' && !stripeAtivo && (
                <Cartao style={styles.cartaoPix}>
                  {/* Banner Contador Regressivo */}
                  <View style={[styles.bannerTempo, { backgroundColor: cores.fundo2 }]}>
                    <Icone nome="relogio" tamanho={18} />
                    <Texto peso={600}>
                      {`Aguardando confirmação • ${minutosFormatados}:${segundosFormatados}`}
                    </Texto>
                  </View>

                  <View style={styles.cabecalhoPix}>
                    <Texto tamanho={26} peso={700}>
                      Pix de R$ 149,00
                    </Texto>
                    <Texto tamanho={13} cor="textoSecundario">
                      Pedido GER-2026-1048 • Essencial • 1 mês
                    </Texto>
                  </View>

                  {/* QR Code */}
                  <QRCodePixVisual />

                  <Texto tamanho={12} cor="textoSecundario" style={{ textAlign: 'center' }}>
                    QR demonstrativo • não realize o pagamento.
                  </Texto>
                  <Texto tamanho={14} peso={600} style={{ textAlign: 'center' }}>
                    Válido até 13:15 de 11 out. 2026
                  </Texto>

                  <Divisor />

                  {/* Copia e Cola */}
                  <View style={{ gap: Espacamento.small }}>
                    <Texto peso={600}>Pix copia e cola</Texto>
                    <TextInput
                      value={CODIGO_PIX_EXEMPLO}
                      editable={false}
                      style={[estiloCampo, styles.inputPixCopia]}
                    />
                    <Botao
                      rotulo={copiado ? '✓ Código copiado!' : 'Copiar código Pix'}
                      icone="copiar"
                      variante="primario"
                      onPress={copiarPix}
                    />
                    <Texto tamanho={12} cor="textoSecundario">
                      Código ilustrativo, sem valor de pagamento.
                    </Texto>
                  </View>

                  <Divisor />

                  {/* Instruções Como Pagar */}
                  <View style={{ gap: Espacamento.small }}>
                    <Texto peso={600} tamanho={16}>
                      Como pagar
                    </Texto>
                    <Texto tamanho={14} cor="textoSecundario">
                      1. Abra o app do seu banco e escolha Pix.
                    </Texto>
                    <Texto tamanho={14} cor="textoSecundario">
                      2. Escaneie o QR Code ou cole o código copiado.
                    </Texto>
                    <Texto tamanho={14} cor="textoSecundario">
                      3. Confira o recebedor Gerêncio e R$ 149,00. Confirme no banco.
                    </Texto>
                  </View>

                  <Cartao style={[styles.avisoCaixa, { backgroundColor: cores.fundo }]}>
                    <Icone nome="info" tamanho={20} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Texto peso={600}>A confirmação aparece aqui</Texto>
                      <Texto tamanho={13} cor="textoSecundario">
                        Já pagou? Aguarde a confirmação automática. Não pague de novo. Se o prazo acabar sem pagamento, gere um novo código.
                      </Texto>
                    </View>
                  </Cartao>

                  {/* Painel de Demonstração / Testes */}
                  <View style={[styles.painelSimulacao, { borderColor: cores.borda }]}>
                    <Texto tamanho={12} peso={600} cor="textoSecundario">
                      CONTROLES DE DEMONSTRAÇÃO:
                    </Texto>
                    <View style={styles.linhaBotoesSimulacao}>
                      <Botao
                        rotulo="Simular confirmação (Sucesso)"
                        icone="check"
                        variante="primario"
                        onPress={() => setEtapaPagamento('sucesso')}
                      />
                      <Botao
                        rotulo="Simular falha / recusa"
                        icone="alerta"
                        onPress={() => setEtapaPagamento('falha')}
                      />
                    </View>
                  </View>

                  <Botao
                    rotulo="Voltar à assinatura"
                    onPress={() => router.push('/configuracoes')}
                  />
                </Cartao>
              )}

              {/* ESTADO 3: SUCESSO */}
              {etapaPagamento === 'sucesso' && (
                <Cartao style={styles.cartaoSucesso}>
                  <View style={[styles.circuloDestaque, { backgroundColor: cores.fundo }]}>
                    <Icone nome="check" tamanho={32} cor={cores.statusEntregue} />
                  </View>

                  <Texto tamanho={26} peso={700}>
                    Seu Essencial está ativo
                  </Texto>
                  <Texto tamanho={14} cor="textoSecundario" style={{ textAlign: 'center' }}>
                    Você já pode usar todos os recursos do Gerêncio para cuidar da sua operação.
                  </Texto>

                  <Divisor />

                  {/* Comprovante */}
                  <View style={styles.secaoComprovante}>
                    <Texto accessibilityRole="header" tamanho={18} peso={600}>
                      Comprovante de pagamento
                    </Texto>

                    <View style={styles.linhaDupla}>
                      <View style={styles.campoFlex}>
                        <Texto tamanho={13} cor="textoSecundario">
                          Valor pago
                        </Texto>
                        <Texto peso={700} tamanho={16}>
                          R$ 149,00
                        </Texto>
                      </View>
                      <View style={styles.campoFlex}>
                        <Texto tamanho={13} cor="textoSecundario">
                          Status
                        </Texto>
                        <Texto peso={600} cor="statusEntregue">
                          {metodo === 'pix' ? 'Pago • Pix confirmado' : 'Pago • Cartão aprovado'}
                        </Texto>
                      </View>
                    </View>

                    <View>
                      <Texto tamanho={13} cor="textoSecundario">
                        Pedido
                      </Texto>
                      <Texto peso={600}>GER-2026-1048</Texto>
                    </View>

                    <View>
                      <Texto tamanho={13} cor="textoSecundario">
                        Estabelecimento
                      </Texto>
                      <Texto peso={600}>
                        {estabelecimento} • {responsavel}
                      </Texto>
                    </View>

                    <View style={styles.linhaDupla}>
                      <View style={styles.campoFlex}>
                        <Texto tamanho={13} cor="textoSecundario">
                          Data do pagamento
                        </Texto>
                        <Texto peso={600}>11 out. 2026 • 12:48</Texto>
                      </View>
                      <View style={styles.campoFlex}>
                        <Texto tamanho={13} cor="textoSecundario">
                          Período contratado
                        </Texto>
                        <Texto peso={600}>11 out. a 10 nov. 2026</Texto>
                      </View>
                    </View>

                    <Texto tamanho={13} cor="textoSecundario">
                      Comprovante enviado para {emailCobranca}. Você também pode baixá-lo abaixo.
                    </Texto>

                    <Botao
                      rotulo="Baixar comprovante"
                      icone="baixar"
                      onPress={() => alert('Download do comprovante em PDF concluído.')}
                    />
                  </View>

                  <Cartao style={[styles.avisoCaixa, { backgroundColor: cores.superficie }]}>
                    <Icone nome="calendario" tamanho={22} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Texto peso={600}>
                        {metodo === 'pix' ? 'Próximo período pelo Pix' : 'Próxima renovação no cartão'}
                      </Texto>
                      <Texto tamanho={13} cor="textoSecundario">
                        O acesso está pago até 10 nov. 2026. Para continuar depois dessa data, faça um novo pagamento. Não há débito automático.
                      </Texto>
                    </View>
                  </Cartao>

                  <View style={{ gap: Espacamento.medium, width: '100%', marginTop: Espacamento.small }}>
                    <Botao
                      rotulo="Ir para o Gerêncio"
                      icone="setaDireita"
                      variante="primario"
                      onPress={() => router.push('/')}
                    />
                    <Botao
                      rotulo="Gerenciar assinatura"
                      onPress={() => router.push('/configuracoes')}
                    />
                  </View>
                </Cartao>
              )}

              {/* ESTADO 4: FALHA */}
              {etapaPagamento === 'falha' && (
                <Cartao style={styles.cartaoFalha}>
                  <View style={[styles.circuloDestaque, { backgroundColor: cores.fundo }]}>
                    <Icone nome="alerta" tamanho={32} cor={cores.feedbackErro} />
                  </View>

                  <Texto tamanho={26} peso={700}>
                    O cartão não foi autorizado
                  </Texto>
                  <Texto tamanho={14} cor="textoSecundario" style={{ textAlign: 'center' }}>
                    O banco recusou esta tentativa. Confira o limite e os dados do cartão ou entre em contato com o banco.
                  </Texto>

                  <Cartao style={[styles.avisoCaixa, { backgroundColor: cores.fundo }]}>
                    <Icone nome="escudo" tamanho={22} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Texto peso={600}>Nenhum pagamento foi confirmado</Texto>
                      <Texto tamanho={13} cor="textoSecundario">
                        Esta tentativa não gerou cobrança no Gerêncio. Sua assinatura ainda não foi ativada. Uma autorização pendente no banco não é um pagamento concluído.
                      </Texto>
                    </View>
                  </Cartao>

                  <View style={styles.secaoDetalheFalha}>
                    <View>
                      <Texto tamanho={12} cor="textoSecundario">
                        Pedido
                      </Texto>
                      <Texto peso={600}>GER-2026-1048 • Essencial</Texto>
                    </View>

                    <View>
                      <Texto tamanho={12} cor="textoSecundario">
                        Tentativa
                      </Texto>
                      <Texto peso={600}>R$ 149,00 • cartão final 4242</Texto>
                    </View>

                    <View>
                      <Texto tamanho={12} cor="textoSecundario">
                        Identificação da falha
                      </Texto>
                      <Texto peso={600}>Pagamento não autorizado • 11 out. 2026, 12:46</Texto>
                    </View>

                    <Texto tamanho={13} cor="textoSecundario">
                      Seus dados de cobrança foram preservados. Antes de tentar novamente, confira o status no banco. Não refaça o pagamento se houver dúvida sobre uma cobrança.
                    </Texto>
                  </View>

                  <View style={{ gap: Espacamento.medium, width: '100%' }}>
                    <Botao
                      rotulo="Revisar cartão e tentar novamente"
                      icone="sincronizar"
                      variante="primario"
                      onPress={() => {
                        setPasso(1);
                        setMetodo('cartao');
                      }}
                    />
                    <Botao
                      rotulo="Alterar método de pagamento"
                      onPress={() => {
                        setPasso(1);
                        setMetodo('pix');
                      }}
                    />
                  </View>

                  <Divisor />

                  {/* Precisa de ajuda */}
                  <View style={{ gap: Espacamento.small, width: '100%' }}>
                    <Texto peso={600}>Precisa de ajuda?</Texto>
                    <Texto tamanho={13} cor="textoSecundario">
                      Informe o pedido GER-2026-1048 ao suporte. Nunca envie o número completo do cartão ou o código de segurança.
                    </Texto>
                    <Botao
                      rotulo="Falar com o suporte"
                      icone="chat"
                      onPress={() => alert('Suporte Gerêncio: atendimento iniciado.')}
                    />
                  </View>
                </Cartao>
              )}
            </>
          )}

          {/* Rodapé geral com nota demonstrativa */}
          <View style={styles.rodapeNota}>
            <Texto tamanho={12} cor="textoSecundario">
              {stripeAtivo
                ? 'Pagamento processado pelo Stripe.'
                : 'Dados demonstrativos • nenhuma cobrança real.'}
            </Texto>
          </View>
        </View>

        {/* Coluna Lateral no Desktop */}
        {emColunas && renderCardSuaAssinatura()}
      </View>
    </Pagina>
  );
}

const styles = StyleSheet.create({
  breadcrumb: {
    marginBottom: -Espacamento.small,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.large,
    paddingVertical: Espacamento.medium,
    paddingHorizontal: Espacamento.large,
  },
  itemPasso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
  },
  circuloPasso: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
  cartaoSecao: {
    gap: Espacamento.large,
  },
  cartaoLateral: {
    gap: Espacamento.medium,
  },
  linhaMetodos: {
    flexDirection: 'row',
    gap: Espacamento.medium,
  },
  opcaoMetodo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Espacamento.large,
    borderWidth: 1.5,
    borderRadius: Raio.medium,
  },
  metodoConteudo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
  },
  radioCirculo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioPonto: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  blocoCampos: {
    gap: Espacamento.large,
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
  inputPixCopia: {
    fontFamily: Fonts?.mono,
    fontSize: 12,
  },
  dicaCampo: {
    marginTop: 4,
  },
  linhaDupla: {
    flexDirection: 'row',
    gap: Espacamento.medium,
  },
  campoFlex: {
    flex: 1,
  },
  avisoCaixa: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Espacamento.medium,
    padding: Espacamento.large,
    borderWidth: 1,
    borderRadius: Raio.medium,
  },
  secaoEndereco: {
    gap: Espacamento.xsmall,
    paddingTop: Espacamento.small,
  },
  rodapeAcoesFluxo: {
    gap: Espacamento.medium,
    paddingVertical: Espacamento.small,
  },
  listaBeneficios: {
    gap: Espacamento.small,
    marginVertical: Espacamento.small,
  },
  linhaTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linhaCabecalhoAmbiente: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.small,
  },
  blocoResumoItem: {
    gap: Espacamento.xsmall,
  },
  cartaoProcessando: {
    alignItems: 'center',
    gap: Espacamento.large,
    paddingVertical: Espacamento.xlarge,
  },
  circuloDestaque: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blocoDetalheProcessamento: {
    width: '100%',
    gap: 4,
  },
  listaProgresso: {
    gap: Espacamento.xsmall,
    marginTop: Espacamento.medium,
  },
  cartaoPix: {
    gap: Espacamento.large,
  },
  bannerTempo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Espacamento.small,
    paddingVertical: Espacamento.small,
    borderRadius: Raio.small,
  },
  cabecalhoPix: {
    alignItems: 'center',
    gap: Espacamento.xsmall,
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Espacamento.small,
  },
  qrMoldura: {
    padding: 12,
    borderWidth: 1,
    borderRadius: Raio.medium,
    backgroundColor: '#FFFFFF',
  },
  qrLinha: {
    flexDirection: 'row',
  },
  qrModulo: {
    width: 8,
    height: 8,
  },
  painelSimulacao: {
    padding: Espacamento.large,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Raio.small,
    gap: Espacamento.small,
  },
  linhaBotoesSimulacao: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Espacamento.medium,
  },
  cartaoSucesso: {
    alignItems: 'center',
    gap: Espacamento.large,
    paddingVertical: Espacamento.large,
  },
  secaoComprovante: {
    width: '100%',
    gap: Espacamento.medium,
  },
  cartaoFalha: {
    alignItems: 'center',
    gap: Espacamento.large,
    paddingVertical: Espacamento.large,
  },
  secaoDetalheFalha: {
    width: '100%',
    gap: Espacamento.small,
  },
  rodapeNota: {
    alignItems: 'center',
    paddingVertical: Espacamento.small,
  },
});

