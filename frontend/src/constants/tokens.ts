/**
 * Tokens do design system, espelhando `src/design-system/variables` (Cores.json e Espaçamento.json).
 */

export const Paleta = {
  amarelo500: '#FF9D00',
  amarelo300: '#FFCE1B',
  azulClaro: '#7C96FF',
  verde500: '#0D7648',
  verde300: '#08C808',
  vermelho: '#FF0004',
  rosa: '#FA004F',
  laranja: '#F55423',
  branco: '#FFFFFF',
  brancoAmarelado: '#FFFDF8',
  branco300: '#EFEBE4',
  pastelAmarelo: '#FFF2D7',
  preto: '#000000',
  cinza600: '#1A1A1A',
  cinza500: '#262626',
  cinza400: '#404040',
  cinza300: '#57544E',
  cinza200: '#BFBFBF',
  marrom: '#5A3E13',
} as const;

export const Cores = {
  light: {
    brand: Paleta.amarelo300,
    fundo: Paleta.brancoAmarelado,
    fundo2: Paleta.pastelAmarelo,
    superficie: Paleta.branco,
    borda: Paleta.branco300,
    textoPrincipal: Paleta.cinza600,
    textoSecundario: Paleta.cinza300,
    textoSecundario2: Paleta.branco,
    textOnBrand: Paleta.cinza600,
    statusNovo: Paleta.azulClaro,
    statusPreparando: Paleta.laranja,
    statusPronto: Paleta.amarelo500,
    statusEntregue: Paleta.verde500,
    statusCancelado: Paleta.cinza300,
    feedbackErro: Paleta.vermelho,
    feedbackSucesso: Paleta.verde300,
    highlightPedido: Paleta.rosa,
  },
  dark: {
    brand: Paleta.amarelo300,
    fundo: Paleta.cinza600,
    fundo2: Paleta.cinza500,
    superficie: Paleta.cinza500,
    borda: Paleta.cinza400,
    textoPrincipal: Paleta.branco,
    textoSecundario: Paleta.cinza200,
    textoSecundario2: Paleta.marrom,
    textOnBrand: Paleta.cinza600,
    statusNovo: Paleta.azulClaro,
    statusPreparando: Paleta.laranja,
    statusPronto: Paleta.amarelo500,
    statusEntregue: Paleta.verde500,
    statusCancelado: Paleta.cinza200,
    feedbackErro: Paleta.vermelho,
    feedbackSucesso: Paleta.verde300,
    highlightPedido: Paleta.rosa,
  },
} as const;

export type CoresTema = { [K in keyof typeof Cores.light]: string };

export const Espacamento = {
  xsmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  xlarge: 32,
} as const;

export const Raio = {
  small: 8,
  medium: 12,
} as const;
