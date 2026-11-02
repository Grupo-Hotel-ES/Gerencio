export class ErroApi extends Error {
  constructor(mensagem: string, public readonly status: number) {
    super(mensagem);
  }
}

/** Cada serviço informa sua URL; erros do backend são apresentados em português. */
export async function requisitarApi<T>(base: string, caminho: string, init?: RequestInit): Promise<T> {
  const controle = new AbortController();
  const tempo = setTimeout(() => controle.abort(), 15_000);
  try {
    const resposta = await fetch(`${base.replace(/\/$/, '')}${caminho}`, { ...init, signal: controle.signal });
    const corpo = resposta.status === 204 ? null : await resposta.json();
    if (!resposta.ok) throw new ErroApi(corpo?.error ?? 'Não foi possível concluir a operação', resposta.status);
    return corpo as T;
  } catch (erro) {
    if (erro instanceof ErroApi) throw erro;
    throw new Error('Não foi possível acessar o servidor. Verifique se as APIs estão em execução e tente novamente.');
  } finally {
    clearTimeout(tempo);
  }
}
