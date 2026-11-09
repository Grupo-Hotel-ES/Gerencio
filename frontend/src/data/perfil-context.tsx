import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useSessao } from '@/data/sessao';
import {
  buscarRestaurante,
  rotuloPapel,
  salvarMeusDados,
  salvarRestaurante,
  type AlteracaoRestaurante,
  type Restaurante,
} from '@/services/api-conta';

/** Dados exibidos e editados na página Perfil: o usuário da sessão e o restaurante. */
export type DadosPerfil = {
  nomeCompleto: string;
  telefoneCelular: string;
  emailAcesso: string;
  cargo: string;
  nomeRestaurante: string;
  razaoSocial: string;
  cnpj: string;
  categoria: string;
  telefoneRestaurante: string;
  emailContato: string;
  cep: string;
  cidadeUf: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  lojaAberta: boolean;
};

/**
 * Retorna as duas primeiras letras do primeiro nome em maiúsculo.
 * Ex: Marina -> MA, Felipe -> FE, Fagundes -> FA.
 */
export function obterIniciais(nome: string): string {
  const limpo = nome.trim();
  if (!limpo) return '??';
  return limpo.slice(0, 2).toUpperCase();
}

/** "Caçapava / SP" <-> { cidade, uf }. */
export function juntarCidadeUf(cidade: string, uf: string) {
  return [cidade, uf].filter(Boolean).join(' / ');
}

export function separarCidadeUf(texto: string) {
  const [cidade = '', uf = ''] = texto.split('/').map((parte) => parte.trim());
  return { cidade, uf: uf.toUpperCase() };
}

type PerfilContextValor = {
  /** null enquanto o restaurante não carregou. */
  perfil: DadosPerfil | null;
  restaurante: Restaurante | null;
  erro: string | null;
  /** Administradores e gerentes editam os dados do restaurante. */
  podeEditarRestaurante: boolean;
  salvarPerfil: (novosDados: DadosPerfil) => Promise<void>;
  atualizarRestaurante: (dados: AlteracaoRestaurante) => Promise<Restaurante>;
  iniciais: string;
};

const PerfilContext = createContext<PerfilContextValor>({
  perfil: null,
  restaurante: null,
  erro: null,
  podeEditarRestaurante: false,
  salvarPerfil: async () => {},
  atualizarRestaurante: async () => { throw new Error('Sem sessão'); },
  iniciais: '??',
});

/** Carrega o restaurante (único) e combina com o usuário da sessão. */
export function PerfilProvider({ children }: { children: ReactNode }) {
  const { usuario, atualizarUsuario } = useSessao();
  const [restaurante, setRestaurante] = useState<Restaurante | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!usuario) return;
    let ativo = true;
    buscarRestaurante()
      .then((dados) => { if (ativo) { setRestaurante(dados); setErro(null); } })
      .catch((e: Error) => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [usuario]);

  const podeEditarRestaurante = usuario?.papel === 'administrador' || usuario?.papel === 'gerente';

  const atualizarRestaurante = useCallback(async (dados: AlteracaoRestaurante) => {
    const atualizado = await salvarRestaurante(dados);
    setRestaurante(atualizado);
    return atualizado;
  }, []);

  const perfil: DadosPerfil | null = usuario && restaurante ? {
    nomeCompleto: usuario.nome,
    telefoneCelular: usuario.telefone,
    emailAcesso: usuario.email,
    cargo: rotuloPapel(usuario.papel),
    nomeRestaurante: restaurante.nome,
    razaoSocial: restaurante.razaoSocial,
    cnpj: restaurante.cnpj,
    categoria: restaurante.categoria,
    telefoneRestaurante: restaurante.telefone,
    emailContato: restaurante.email,
    cep: restaurante.cep,
    cidadeUf: juntarCidadeUf(restaurante.cidade, restaurante.uf),
    logradouro: restaurante.logradouro,
    numero: restaurante.numero,
    complemento: restaurante.complemento,
    bairro: restaurante.bairro,
    lojaAberta: restaurante.configuracoes.operacao?.lojaAberta ?? true,
  } : null;

  const salvarPerfil = async (dados: DadosPerfil) => {
    atualizarUsuario(await salvarMeusDados({ nome: dados.nomeCompleto, email: dados.emailAcesso, telefone: dados.telefoneCelular }));
    if (!podeEditarRestaurante) return;
    await atualizarRestaurante({
      nome: dados.nomeRestaurante,
      razaoSocial: dados.razaoSocial,
      cnpj: dados.cnpj,
      categoria: dados.categoria,
      telefone: dados.telefoneRestaurante,
      email: dados.emailContato,
      cep: dados.cep,
      ...separarCidadeUf(dados.cidadeUf),
      logradouro: dados.logradouro,
      numero: dados.numero,
      complemento: dados.complemento,
      bairro: dados.bairro,
    });
  };

  return (
    <PerfilContext.Provider value={{
      perfil, restaurante, erro, podeEditarRestaurante, salvarPerfil, atualizarRestaurante,
      iniciais: obterIniciais(usuario?.nome ?? ''),
    }}>
      {children}
    </PerfilContext.Provider>
  );
}

export function usePerfil() {
  return useContext(PerfilContext);
}
