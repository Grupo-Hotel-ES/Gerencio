import { createContext, useContext, useState, type ReactNode } from 'react';

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

export const PERFIL_PADRAO: DadosPerfil = {
  nomeCompleto: 'Marina Almeida',
  telefoneCelular: '(11) 98765-4321',
  emailAcesso: 'marina@vilabistro.com.br',
  cargo: 'Administradora',
  nomeRestaurante: 'Vila Bistrô',
  razaoSocial: 'Vila Bistrô Alimentação Ltda.',
  cnpj: '12.345.678/0001-90',
  categoria: 'Restaurante',
  telefoneRestaurante: '(11) 3456-7890',
  emailContato: 'contato@vilabistro.com.br',
  cep: '01001-000',
  cidadeUf: 'São Paulo / SP',
  logradouro: 'Rua das Palmeiras',
  numero: '120',
  complemento: 'Loja 2',
  bairro: 'Centro',
  lojaAberta: true,
};

/**
 * Retorna as duas primeiras letras do primeiro nome em maiúsculo.
 * Ex: Marina -> MA, Felipe -> FE, Fagundes -> FA.
 */
export function obterIniciais(nome: string): string {
  const limpo = nome.trim();
  if (!limpo) return 'MA';
  return limpo.slice(0, 2).toUpperCase();
}

type PerfilContextValor = {
  perfil: DadosPerfil;
  atualizarPerfil: (novosDados: Partial<DadosPerfil>) => void;
  salvarPerfil: (novosDados: DadosPerfil) => void;
  iniciais: string;
};

const PerfilContext = createContext<PerfilContextValor>({
  perfil: PERFIL_PADRAO,
  atualizarPerfil: () => {},
  salvarPerfil: () => {},
  iniciais: 'MA',
});

export function PerfilProvider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<DadosPerfil>(PERFIL_PADRAO);

  const atualizarPerfil = (novosDados: Partial<DadosPerfil>) => {
    setPerfil((anterior) => ({ ...anterior, ...novosDados }));
  };

  const salvarPerfil = (novosDados: DadosPerfil) => {
    setPerfil(novosDados);
  };

  const iniciais = obterIniciais(perfil.nomeCompleto);

  return (
    <PerfilContext.Provider value={{ perfil, atualizarPerfil, salvarPerfil, iniciais }}>
      {children}
    </PerfilContext.Provider>
  );
}

export function usePerfil() {
  return useContext(PerfilContext);
}

