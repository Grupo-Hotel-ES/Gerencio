import {
  lerCacheLeitura,
  montarChaveCache,
  registrarFalhaConexaoSemCache,
  registrarSucessoConexao,
  registrarUsoCacheOffline,
  salvarCacheLeitura,
} from './cache-offline';

export class ErroApi extends Error {
  constructor(mensagem: string, public readonly status: number) {
    super(mensagem);
  }
}

// Token da sessão, definido pelo SessaoProvider. Vai em todas as requisições.
let tokenAtual: string | null = null;
let aoExpirarSessao: (() => void) | null = null;

export function definirSessaoHttp(token: string | null, aoExpirar?: () => void) {
  tokenAtual = token;
  aoExpirarSessao = aoExpirar ?? null;
}

const STATUS_GATEWAY_INDISPONIVEL = new Set([502, 503, 504]);

/** Cada serviço informa sua URL; erros do backend são apresentados em português. */
export async function requisitarApi<T>(
  base: string,
  caminho: string,
  init?: RequestInit,
  tempoLimiteMs = 15_000,
): Promise<T> {
  const metodo = (init?.method ?? 'GET').toUpperCase();
  const ehLeitura = metodo === 'GET';
  const chaveCache = ehLeitura ? montarChaveCache(base, caminho) : null;

  const controle = new AbortController();
  const tempo = setTimeout(() => controle.abort(), tempoLimiteMs);
  const cabecalhos = new Headers(init?.headers);
  if (tokenAtual && !cabecalhos.has('Authorization')) {
    cabecalhos.set('Authorization', `Bearer ${tokenAtual}`);
  }

  try {
    const resposta = await fetch(`${base.replace(/\/$/, '')}${caminho}`, {
      ...init,
      headers: cabecalhos,
      signal: controle.signal,
    });
    const corpo = resposta.status === 204 ? null : await resposta.json().catch(() => null);

    if (!resposta.ok) {
      // Token vencido ou inválido: volta para o login
      if (resposta.status === 401 && tokenAtual) aoExpirarSessao?.();

      // Se o proxy/VPS estiver temporariamente fora do ar (502/503/504) em uma leitura, usa o cache local
      if (ehLeitura && chaveCache && STATUS_GATEWAY_INDISPONIVEL.has(resposta.status)) {
        const cache = lerCacheLeitura<T>(chaveCache);
        if (cache) {
          registrarUsoCacheOffline(cache.salvoEm);
          return cache.dados;
        }
      }

      // Em erros 4xx o detalhe explica o motivo (ex.: endereço do restaurante sem cadastro)
      const mensagem = corpo?.error ?? 'Não foi possível concluir a operação';
      const detalhe = resposta.status < 500 && corpo?.detalhe ? `: ${corpo.detalhe}` : '';
      throw new ErroApi(`${mensagem}${detalhe}`, resposta.status);
    }

    registrarSucessoConexao();
    if (ehLeitura && chaveCache && resposta.status !== 204) {
      salvarCacheLeitura(chaveCache, corpo);
    }

    return corpo as T;
  } catch (erro) {
    if (erro instanceof ErroApi) throw erro;

    if (ehLeitura && chaveCache) {
      const cache = lerCacheLeitura<T>(chaveCache);
      if (cache) {
        registrarUsoCacheOffline(cache.salvoEm);
        return cache.dados;
      }
    }

    registrarFalhaConexaoSemCache();
    throw new Error(
      'Não foi possível acessar o servidor. Verifique sua conexão ou se as APIs estão em execução.',
    );
  } finally {
    clearTimeout(tempo);
  }
}
