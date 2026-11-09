import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { buscarUsuarioDaSessao, entrar as entrarNaApi, type Usuario } from '@/services/api-conta';
import { definirSessaoHttp } from '@/services/http';

const CHAVE_TOKEN = 'geroncio.token';

// Web: localStorage. App: SecureStore (chaveiro do sistema). Falhas de acesso viram "sem sessão".
const armazenamento = {
  async ler() {
    try {
      if (Platform.OS === 'web') return globalThis.localStorage?.getItem(CHAVE_TOKEN) ?? null;
      return await SecureStore.getItemAsync(CHAVE_TOKEN);
    } catch {
      return null;
    }
  },
  async gravar(token: string | null) {
    try {
      if (Platform.OS === 'web') {
        if (token) globalThis.localStorage?.setItem(CHAVE_TOKEN, token);
        else globalThis.localStorage?.removeItem(CHAVE_TOKEN);
      } else if (token) await SecureStore.setItemAsync(CHAVE_TOKEN, token);
      else await SecureStore.deleteItemAsync(CHAVE_TOKEN);
    } catch {
      // Sem armazenamento: a sessão vale só enquanto o app estiver aberto
    }
  },
};

type SessaoValor = {
  /** true até descobrir se há uma sessão salva. */
  carregando: boolean;
  usuario: Usuario | null;
  entrar: (login: string, senha: string, lembrar: boolean) => Promise<void>;
  sair: () => void;
  atualizarUsuario: (usuario: Usuario) => void;
};

const SessaoContext = createContext<SessaoValor>({
  carregando: true,
  usuario: null,
  entrar: async () => {},
  sair: () => {},
  atualizarUsuario: () => {},
});

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  const sair = useCallback(() => {
    definirSessaoHttp(null);
    setUsuario(null);
    armazenamento.gravar(null);
  }, []);

  // Restaura a sessão salva e confere se o token ainda vale
  useEffect(() => {
    let ativo = true;
    armazenamento.ler().then(async (token) => {
      if (token) {
        definirSessaoHttp(token, sair);
        try {
          const dados = await buscarUsuarioDaSessao();
          if (ativo) setUsuario(dados);
        } catch {
          if (ativo) sair();
        }
      }
      if (ativo) setCarregando(false);
    });
    return () => { ativo = false; };
  }, [sair]);

  const entrar = useCallback(async (login: string, senha: string, lembrar: boolean) => {
    const { token, usuario: dados } = await entrarNaApi(login, senha);
    definirSessaoHttp(token, sair);
    // Sem "manter conectado", a sessão vale só enquanto o app estiver aberto
    await armazenamento.gravar(lembrar ? token : null);
    setUsuario(dados);
  }, [sair]);

  return (
    <SessaoContext.Provider value={{ carregando, usuario, entrar, sair, atualizarUsuario: setUsuario }}>
      {children}
    </SessaoContext.Provider>
  );
}

export function useSessao() {
  return useContext(SessaoContext);
}
