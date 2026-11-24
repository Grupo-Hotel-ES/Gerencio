import { useEffect, useState } from 'react';

const PREFIXO_CACHE = 'geroncio.cache.v1:';
const CHAVE_INDICE = 'geroncio.cache.v1:__indice__';

export type RegistroCache<T = unknown> = {
  dados: T;
  salvoEm: string;
};

export type EstadoConexaoOffline = {
  /** false quando o navegador/dispositivo perde rede ou a API fica inacessível. */
  online: boolean;
  /** true quando a última leitura precisou recorrer ao snapshot salvo localmente. */
  usandoCacheOffline: boolean;
  /** Horário ISO do snapshot exibido no fallback offline. */
  ultimoCacheUsadoEm: string | null;
  /** Horário ISO da última resposta online bem-sucedida da API. */
  ultimaSincronizacaoEm: string | null;
};

// Espelho em memória garante funcionamento mesmo em ambientes sem localStorage (SSR / Native)
const memoriaCache = new Map<string, string>();

let estadoAtual: EstadoConexaoOffline = {
  online: typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true,
  usandoCacheOffline: false,
  ultimoCacheUsadoEm: null,
  ultimaSincronizacaoEm: null,
};

const ouvintes = new Set<(estado: EstadoConexaoOffline) => void>();

function notificar() {
  ouvintes.forEach((ouvinte) => {
    ouvinte(estadoAtual);
  });
}

function atualizarEstado(parcial: Partial<EstadoConexaoOffline>) {
  const mudou =
    (parcial.online !== undefined && parcial.online !== estadoAtual.online) ||
    (parcial.usandoCacheOffline !== undefined &&
      parcial.usandoCacheOffline !== estadoAtual.usandoCacheOffline) ||
    (parcial.ultimoCacheUsadoEm !== undefined &&
      parcial.ultimoCacheUsadoEm !== estadoAtual.ultimoCacheUsadoEm) ||
    (parcial.ultimaSincronizacaoEm !== undefined &&
      parcial.ultimaSincronizacaoEm !== estadoAtual.ultimaSincronizacaoEm);

  if (!mudou) return;
  estadoAtual = { ...estadoAtual, ...parcial };
  notificar();
}

function obterLocalStorage(): Storage | null {
  try {
    return typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? (globalThis.localStorage ?? null)
      : null;
  } catch {
    return null;
  }
}

// Escuta eventos nativos de conectividade no navegador (Web)
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => {
    atualizarEstado({ online: true });
  });
  window.addEventListener('offline', () => {
    atualizarEstado({ online: false });
  });
}

function lerBruto(chaveCompleta: string): string | null {
  const storage = obterLocalStorage();
  if (storage) {
    try {
      const valor = storage.getItem(chaveCompleta);
      if (valor !== null) return valor;
    } catch {
      // Segue para o espelho em memória
    }
  }
  return memoriaCache.get(chaveCompleta) ?? null;
}

function gravarBruto(chaveCompleta: string, valor: string) {
  memoriaCache.set(chaveCompleta, valor);
  const storage = obterLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(chaveCompleta, valor);
    const indiceBruto = storage.getItem(CHAVE_INDICE);
    const chaves: string[] = indiceBruto ? JSON.parse(indiceBruto) : [];
    if (!chaves.includes(chaveCompleta)) {
      chaves.push(chaveCompleta);
      storage.setItem(CHAVE_INDICE, JSON.stringify(chaves));
    }
  } catch {
    // Se a quota do localStorage esgotar, mantém ao menos em memória durante a sessão
  }
}

/** Normaliza a chave do endpoint (base + caminho) para armazenamento consistente. */
export function montarChaveCache(base: string, caminho: string): string {
  return `${PREFIXO_CACHE}${base.replace(/\/$/, '')}${caminho}`;
}

/** Salva o resultado de uma leitura GET bem-sucedida com o timestamp atual. */
export function salvarCacheLeitura<T>(chaveCompleta: string, dados: T): void {
  const agora = new Date().toISOString();
  const registro: RegistroCache<T> = {
    dados,
    salvoEm: agora,
  };
  try {
    gravarBruto(chaveCompleta, JSON.stringify(registro));
  } catch {
    // Ignora falha de serialização
  }
}

/** Recupera o último snapshot salvo para o endpoint, caso exista. */
export function lerCacheLeitura<T>(chaveCompleta: string): RegistroCache<T> | null {
  const bruto = lerBruto(chaveCompleta);
  if (!bruto) return null;
  try {
    const parsed = JSON.parse(bruto) as RegistroCache<T>;
    if (!parsed || typeof parsed !== 'object' || !('dados' in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Permite atualizar otimisticamente um snapshot em cache (ex.: descontar saldo local
 * ou incluir um pedido criado offline na Etapa 2).
 */
export function atualizarCacheLeitura<T>(
  chaveCompleta: string,
  atualizador: (atual: T) => T,
): boolean {
  const existente = lerCacheLeitura<T>(chaveCompleta);
  if (!existente) return false;
  const novoValor = atualizador(existente.dados);
  salvarCacheLeitura(chaveCompleta, novoValor);
  return true;
}

/** Remove todos os snapshots de leitura (chamado ao encerrar a sessão do usuário). */
export function limparCacheLeitura(): void {
  memoriaCache.clear();
  const storage = obterLocalStorage();
  if (storage) {
    try {
      const indiceBruto = storage.getItem(CHAVE_INDICE);
      const chaves: string[] = indiceBruto ? JSON.parse(indiceBruto) : [];
      for (const chave of chaves) {
        storage.removeItem(chave);
      }
      storage.removeItem(CHAVE_INDICE);
    } catch {
      // Ignora erro de acesso ao storage
    }
  }
  atualizarEstado({
    usandoCacheOffline: false,
    ultimoCacheUsadoEm: null,
  });
}

/** Registra que o servidor respondeu com sucesso em modo online. */
export function registrarSucessoConexao(): void {
  atualizarEstado({
    online: true,
    usandoCacheOffline: false,
    ultimaSincronizacaoEm: new Date().toISOString(),
  });
}

/** Registra que uma leitura precisou usar o snapshot local por falta de conexão com a API. */
export function registrarUsoCacheOffline(salvoEm: string): void {
  atualizarEstado({
    online: false,
    usandoCacheOffline: true,
    ultimoCacheUsadoEm: salvoEm,
  });
}

/** Registra falha de rede quando não havia snapshot prévio salvo para aquela rota. */
export function registrarFalhaConexaoSemCache(): void {
  atualizarEstado({
    online: false,
  });
}

export function obterEstadoOffline(): EstadoConexaoOffline {
  return estadoAtual;
}

export function inscreverEstadoOffline(
  ouvinte: (estado: EstadoConexaoOffline) => void,
): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Hook React para acompanhar em tempo real se o painel está operando em modo offline / cache. */
export function useEstadoOffline(): EstadoConexaoOffline {
  const [estado, setEstado] = useState<EstadoConexaoOffline>(obterEstadoOffline);

  useEffect(() => {
    setEstado(obterEstadoOffline());
    return inscreverEstadoOffline(setEstado);
  }, []);

  return estado;
}
