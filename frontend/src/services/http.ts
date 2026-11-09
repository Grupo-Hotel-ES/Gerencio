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

/** Cada serviço informa sua URL; erros do backend são apresentados em português. */
export async function requisitarApi<T>(base: string, caminho: string, init?: RequestInit, tempoLimiteMs = 15_000): Promise<T> {
  const controle = new AbortController();
  const tempo = setTimeout(() => controle.abort(), tempoLimiteMs);
  const cabecalhos = new Headers(init?.headers);
  if (tokenAtual && !cabecalhos.has('Authorization')) cabecalhos.set('Authorization', `Bearer ${tokenAtual}`);
  try {
    const resposta = await fetch(`${base.replace(/\/$/, '')}${caminho}`, { ...init, headers: cabecalhos, signal: controle.signal });
    const corpo = resposta.status === 204 ? null : await resposta.json();
    if (!resposta.ok) {
      // Token vencido ou inválido: volta para o login
      if (resposta.status === 401 && tokenAtual) aoExpirarSessao?.();
      throw new ErroApi(corpo?.error ?? 'Não foi possível concluir a operação', resposta.status);
    }
    return corpo as T;
  } catch (erro) {
    if (erro instanceof ErroApi) throw erro;
    throw new Error('Não foi possível acessar o servidor. Verifique se as APIs estão em execução e tente novamente.');
  } finally {
    clearTimeout(tempo);
  }
}
