import { requisitarApi } from './http';

// Login, usuários e o restaurante (único) ficam na api-restaurantes
const BASE_URL = process.env.EXPO_PUBLIC_API_RESTAURANTES_URL ?? 'http://localhost:3003/api';

export type PapelUsuario = 'administrador' | 'gerente' | 'operador';

export const PAPEIS: { id: PapelUsuario; rotulo: string; descricao: string }[] = [
  {
    id: 'administrador',
    rotulo: 'Administrador',
    descricao: 'Acesso completo: equipe, estabelecimento, integrações, estoque, pedidos e relatórios.',
  },
  {
    id: 'gerente',
    rotulo: 'Gerente',
    descricao: 'Gerencia pedidos, estoque e os dados do estabelecimento. Sem gestão de usuários.',
  },
  {
    id: 'operador',
    rotulo: 'Operador',
    descricao: 'Acompanha e atualiza pedidos e consulta o estoque. Sem edição das configurações.',
  },
];

export function rotuloPapel(papel: PapelUsuario) {
  return PAPEIS.find((p) => p.id === papel)?.rotulo ?? papel;
}

export type Usuario = {
  id: number;
  nome: string;
  login: string;
  email: string;
  telefone: string;
  papel: PapelUsuario;
  ativo: boolean;
  criadoEm: string;
};

/** Operação da loja e preferências, guardadas em `Restaurante.configuracoes`. */
export type ConfiguracoesRestaurante = {
  operacao?: {
    lojaAberta?: boolean;
    fusoHorario?: string;
    diasFuncionamento?: string;
    abertura?: string;
    fechamento?: string;
    entregaPropria?: boolean;
    retiradaLocal?: boolean;
  };
  preferencias?: {
    baixaAutomatica?: boolean;
    indisponivelZero?: boolean;
    alertasEstoqueBaixo?: boolean;
    limiteAlerta?: string;
    unidadePadrao?: string;
    notifNovosPedidos?: boolean;
    notifFalhasSync?: boolean;
    notifEstoqueBaixo?: boolean;
    notifSom?: boolean;
    notifResumoDiario?: boolean;
    emailAvisos?: string;
  };
};

export type Restaurante = {
  id: number;
  nome: string;
  razaoSocial: string;
  cnpj: string;
  categoria: string;
  telefone: string;
  email: string;
  cep: string;
  cidade: string;
  uf: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  configuracoes: ConfiguracoesRestaurante;
  taxaEntregaBase: number;
  kmInclusosTaxaBase: number;
  custoPorKmAdicional: number;
  distanciaMaximaKm: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type AlteracaoRestaurante = Partial<Omit<Restaurante, 'id' | 'latitude' | 'longitude'>>;

function enviar<T>(caminho: string, metodo: string, dados?: unknown) {
  return requisitarApi<T>(BASE_URL, caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    ...(dados !== undefined && { body: JSON.stringify(dados) }),
  });
}

export const entrar = (login: string, senha: string) =>
  enviar<{ token: string; usuario: Usuario }>('/auth/login', 'POST', { login, senha });
export const buscarUsuarioDaSessao = () => requisitarApi<Usuario>(BASE_URL, '/auth/eu');
export const buscarMarca = () => requisitarApi<{ nome: string }>(BASE_URL, '/restaurante/marca');

export const buscarRestaurante = () => requisitarApi<Restaurante>(BASE_URL, '/restaurante');
export const salvarRestaurante = (dados: AlteracaoRestaurante) => enviar<Restaurante>('/restaurante', 'PATCH', dados);

export const salvarMeusDados = (dados: Pick<Usuario, 'nome' | 'email' | 'telefone'>) =>
  enviar<Usuario>('/usuarios/eu', 'PATCH', dados);
export const trocarMinhaSenha = (senhaAtual: string, novaSenha: string) =>
  enviar<null>('/usuarios/eu/senha', 'POST', { senhaAtual, novaSenha });

export const listarUsuarios = () => requisitarApi<Usuario[]>(BASE_URL, '/usuarios');
export const cadastrarUsuario = (dados: Pick<Usuario, 'nome' | 'login' | 'email' | 'papel'> & { senha: string }) =>
  enviar<Usuario>('/usuarios', 'POST', dados);
export const editarUsuario = (id: number, dados: Partial<Pick<Usuario, 'nome' | 'email' | 'telefone' | 'papel' | 'ativo'>> & { senha?: string }) =>
  enviar<Usuario>(`/usuarios/${id}`, 'PATCH', dados);
export const removerUsuario = (id: number) => enviar<null>(`/usuarios/${id}`, 'DELETE');
