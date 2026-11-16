// API do mock: recebe os pedidos montados no mock_frontend e grava no banco do mock
// (Pedido + Evento inicial), simulando o "mundo externo" das plataformas de delivery.
//
// Executar a partir de mock/:   pnpm api   (Node >= 22.18 roda TypeScript direto)

import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma, type ProdutoPlataforma } from "../../src/generated/prisma/client.ts";
import type { Plataforma, TipoPedido, EntreguePor, CanalEvento } from "../../src/generated/prisma/enums.ts";
import { montarPedidoRappi, dispararWebhookNovoPedido as dispararWebhookRappi } from "../rappi/index.ts";
import { montarPedidoIFood } from "../ifood/index.ts";

import { montarPedidoUber, dispararWebhookUber, dispararWebhookFalhaUber } from "../uber/index.ts";

import {
  montarPedido99Food,
  montarEventoNovoPedido99Food,
  dispararWebhookNovoPedido as dispararWebhook99Food,
} from "../99/index.ts";

const PORTA = Number(process.env["MOCK_API_PORT"] ?? 3333);
const RESTAURANTE_ID_PADRAO = process.env["MOCK_RESTAURANTE_ID"] ?? "restaurante-mock";
const UBER_CLIENT_SECRET = process.env["UBER_CLIENT_SECRET"] || 'mock_secret_key';

export const uberTimers = new Map<string, NodeJS.Timeout>();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["MOCK_DATABASE_URL"] }),
});

// ---------------------------------------------------------------------------
// Configuração por plataforma
// ---------------------------------------------------------------------------

type ConfigPlataforma = {
  statusInicial: string;
  tipoEventoNovoPedido: string;
  canal: CanalEvento;
  prazoAceiteSegundos: number;
  lojaIdPadrao: string;
  gerarIdExterno: () => string;
};

const PLATAFORMAS: Record<Plataforma, ConfigPlataforma> = {
  IFOOD: {
    statusInicial: "PLACED",
    tipoEventoNovoPedido: "PLACED",
    canal: "POLLING",
    prazoAceiteSegundos: 8 * 60,
    lojaIdPadrao: "ifood-loja-mock",
    gerarIdExterno: () => randomUUID(),
  },
  NOVENTA_NOVE_FOOD: {
    statusInicial: "SENT",
    tipoEventoNovoPedido: "1001",
    canal: "WEBHOOK",
    prazoAceiteSegundos: 5 * 60,
    lojaIdPadrao: "99-loja-mock",
    gerarIdExterno: () => String(Math.floor(Math.random() * 1e9)),
  },
  KEETA: {
    statusInicial: "SENT",
    tipoEventoNovoPedido: "NEW_ORDER",
    canal: "WEBHOOK",
    prazoAceiteSegundos: 5 * 60,
    lojaIdPadrao: "keeta-loja-mock",
    gerarIdExterno: () => String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, "0"),
  },
  UBER_EATS: {
    statusInicial: "CREATED",
    tipoEventoNovoPedido: "orders.notification",
    canal: "WEBHOOK",
    prazoAceiteSegundos: 690,
    lojaIdPadrao: "uber-loja-mock",
    gerarIdExterno: () => randomUUID(),
  },
  RAPPI: {
    statusInicial: "SENT",
    tipoEventoNovoPedido: "NEW_ORDER",
    canal: "WEBHOOK",
    prazoAceiteSegundos: 6 * 60,
    lojaIdPadrao: "rappi-loja-mock",
    gerarIdExterno: () => String(Math.floor(Math.random() * 1e8)),
  },
};

function normalizarPlataforma(valor: unknown): Plataforma | null {
  if (typeof valor !== "string") return null;
  const chave = valor.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const mapa: Record<string, Plataforma> = {
    ifood: "IFOOD",
    "99food": "NOVENTA_NOVE_FOOD",
    "99": "NOVENTA_NOVE_FOOD",
    noventanovefood: "NOVENTA_NOVE_FOOD",
    keeta: "KEETA",
    ubereats: "UBER_EATS",
    uber: "UBER_EATS",
    rappi: "RAPPI",
  };
  return mapa[chave] ?? null;
}

/** Identificador da plataforma usado pelo Gerêncio (MapeamentoApp) e pelas URLs do catálogo. */
const ID_PUBLICO: Record<Plataforma, string> = {
  IFOOD: "ifood",
  NOVENTA_NOVE_FOOD: "99food",
  KEETA: "keeta",
  UBER_EATS: "ubereats",
  RAPPI: "rappi",
};

const NOME_PLATAFORMA: Record<Plataforma, string> = {
  IFOOD: "iFood",
  NOVENTA_NOVE_FOOD: "99 Food",
  KEETA: "Keeta",
  UBER_EATS: "Uber Eats",
  RAPPI: "Rappi",
};

const digitos = (n: number) => Array.from({ length: n }, () => randomInt(10)).join("");
const sorteio = (alfabeto: string, n: number) => Array.from({ length: n }, () => alfabeto[randomInt(alfabeto.length)]).join("");
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Cada plataforma gera o ID do produto no seu próprio formato (curto, para ser copiado no Gerêncio). */
const GERAR_ID_PRODUTO: Record<Plataforma, () => string> = {
  IFOOD: () => `SKU-${digitos(3)}-${sorteio(LETRAS, 3)}`,
  RAPPI: () => `${digitos(3)}-${digitos(3)}`,
  UBER_EATS: () => `UE-${sorteio(LETRAS + "0123456789", 6)}`,
  NOVENTA_NOVE_FOOD: () => `99-${digitos(6)}`,
  KEETA: () => `KT${digitos(7)}`,
};

// ---------------------------------------------------------------------------
// HTTP utilitários
// ---------------------------------------------------------------------------

class ErroHttp extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

function enviarJson(res: ServerResponse, status: number, corpo?: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
}

async function lerCorpo(req: IncomingMessage): Promise<any> {
  const partes: Buffer[] = [];
  for await (const parte of req) partes.push(parte as Buffer);
  if (partes.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf-8"));
  } catch {
    throw new ErroHttp(400, "Corpo da requisição não é um JSON válido");
  }
}

function aplicarCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function exigirInteiroNaoNegativo(valor: unknown, campo: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) throw new ErroHttp(400, `"${campo}" deve ser um inteiro >= 0`);
  return n;
}

// ---------------------------------------------------------------------------
// Catálogo das plataformas (portal do restaurante)
// ---------------------------------------------------------------------------

function formatarProduto(produto: ProdutoPlataforma) {
  return {
    idExterno: produto.idExterno,
    plataforma: ID_PUBLICO[produto.plataforma],
    nome: produto.nome,
    categoria: produto.categoria,
    precoCentavos: produto.precoCentavos,
    quantidade: produto.quantidade,
    sincronizadoEm: produto.sincronizadoEm,
    criadoEm: produto.criadoEm,
    atualizadoEm: produto.atualizadoEm,
  };
}

function exigirPlataforma(valor: unknown): Plataforma {
  const plataforma = normalizarPlataforma(valor);
  if (!plataforma) throw new ErroHttp(400, `Plataforma inválida: ${JSON.stringify(valor)}`);
  return plataforma;
}

function exigirTexto(valor: unknown, campo: string, limite = 100): string {
  if (typeof valor !== "string" || !valor.trim()) throw new ErroHttp(400, `"${campo}" é obrigatório`);
  if (valor.trim().length > limite) throw new ErroHttp(400, `"${campo}" deve ter até ${limite} caracteres`);
  return valor.trim();
}

/** Aceita precoCentavos (inteiro) ou preco em reais ("12,50", 12.5). */
function lerPrecoCentavos(corpo: any): number {
  if (corpo.precoCentavos !== undefined) return exigirInteiroNaoNegativo(corpo.precoCentavos, "precoCentavos");
  const reais = Number(String(corpo.preco ?? "").replace(",", "."));
  if (corpo.preco === undefined || corpo.preco === "" || !Number.isFinite(reais) || reais < 0) {
    throw new ErroHttp(400, '"preco" deve ser um valor em reais maior ou igual a zero');
  }
  return Math.round(reais * 100);
}

function exigirQuantidade(valor: unknown): number {
  const quantidade = exigirInteiroNaoNegativo(valor, "quantidade");
  if (quantidade > 1_000_000) throw new ErroHttp(400, '"quantidade" deve ser no máximo 1.000.000');
  return quantidade;
}

async function listarCatalogo(params: URLSearchParams) {
  const plataforma = params.get("plataforma");
  const produtos = await prisma.produtoPlataforma.findMany({
    where: plataforma ? { plataforma: exigirPlataforma(plataforma) } : {},
    orderBy: [{ plataforma: "asc" }, { nome: "asc" }],
  });
  return produtos.map(formatarProduto);
}

/** O restaurante cadastra o produto e a plataforma devolve o ID dele. */
async function criarProdutoCatalogo(corpo: any) {
  const plataforma = exigirPlataforma(corpo.plataforma);
  const dados = {
    plataforma,
    nome: exigirTexto(corpo.nome, "nome"),
    categoria: corpo.categoria === undefined || corpo.categoria === "" ? "Sem categoria" : exigirTexto(corpo.categoria, "categoria", 60),
    precoCentavos: lerPrecoCentavos(corpo),
    quantidade: exigirQuantidade(corpo.quantidade ?? 0),
  };
  // O ID sorteado pode colidir com um existente; a constraint única decide e um novo é sorteado.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      return formatarProduto(await prisma.produtoPlataforma.create({ data: { ...dados, idExterno: GERAR_ID_PRODUTO[plataforma]() } }));
    } catch (erro) {
      if (!(erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002")) throw erro;
    }
  }
  throw new ErroHttp(503, "Não foi possível gerar um ID livre para o produto. Tente novamente");
}

async function buscarProdutoCatalogo(plataformaUrl: string, idExterno: string) {
  const plataforma = exigirPlataforma(plataformaUrl);
  const produto = await prisma.produtoPlataforma.findUnique({ where: { plataforma_idExterno: { plataforma, idExterno } } });
  if (!produto) throw new ErroHttp(404, `Produto ${idExterno} não encontrado no ${NOME_PLATAFORMA[plataforma]}`);
  return produto;
}

// Endereço do Gerêncio que recebe o estoque e o preço mudados no portal de um produto vinculado.
const URL_CATALOGO_GERENCIO = process.env["GERENCIO_CATALOGO_URL"] ?? "http://localhost:3005/api/webhooks/catalogo";
// Opcional: com o mesmo segredo nos dois lados, o aviso vai assinado (X-Plataforma-Assinatura)
const SEGREDO_CATALOGO = process.env["CATALOGO_WEBHOOK_SECRET"];

type RespostaGerencio = { vinculado: boolean; restaurado: boolean };

/** Avisa o Gerêncio da mudança feita no portal. Sem vínculo por lá (404), o produto fica só da plataforma. */
async function avisarGerencio(plataforma: Plataforma, idExterno: string, valores: { quantidade?: number; precoCentavos?: number }): Promise<RespostaGerencio> {
  const corpo = JSON.stringify({ plataforma: ID_PUBLICO[plataforma], idExterno, ...valores });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SEGREDO_CATALOGO) {
    const t = Math.floor(Date.now() / 1000);
    headers["X-Plataforma-Assinatura"] = `t=${t},sign=${createHmac("sha256", SEGREDO_CATALOGO).update(`${t}.${corpo}`).digest("hex")}`;
  }
  let resposta: Response;
  try {
    resposta = await fetch(URL_CATALOGO_GERENCIO, { method: "POST", headers, body: corpo, signal: AbortSignal.timeout(5000) });
  } catch {
    throw new ErroHttp(502, "O Gerêncio não respondeu, então nada foi alterado. Tente de novo em instantes");
  }
  if (resposta.status === 404) return { vinculado: false, restaurado: false };
  const dados = await resposta.json().catch(() => null) as { error?: string; restaurado?: boolean } | null;
  if (!resposta.ok) throw new ErroHttp(502, `O Gerêncio recusou a alteração: ${dados?.error ?? `status ${resposta.status}`}`);
  return { vinculado: true, restaurado: Boolean(dados?.restaurado) };
}

/**
 * Edição pelo portal ou atualização enviada pelo Gerêncio (corpo com origem "gerencio").
 * Num produto vinculado, estoque e preço mudados no portal vão primeiro para o Gerêncio, que atualiza o
 * saldo dele e repassa a todas as plataformas vinculadas; se o Gerêncio não responder, nada muda.
 */
async function atualizarProdutoCatalogo(plataformaUrl: string, idExterno: string, corpo: any) {
  const produto = await buscarProdutoCatalogo(plataformaUrl, idExterno);
  const peloGerencio = corpo.origem === "gerencio";
  const quantidade = corpo.quantidade !== undefined ? exigirQuantidade(corpo.quantidade) : undefined;
  const precoCentavos = corpo.precoCentavos !== undefined || corpo.preco !== undefined ? lerPrecoCentavos(corpo) : undefined;
  const mudancas = {
    ...(quantidade !== undefined && quantidade !== produto.quantidade && { quantidade }),
    ...(precoCentavos !== undefined && precoCentavos !== produto.precoCentavos && { precoCentavos }),
  };
  const gerencio = produto.sincronizadoEm && !peloGerencio && Object.keys(mudancas).length > 0
    ? await avisarGerencio(produto.plataforma, produto.idExterno, mudancas)
    : null;
  const atualizado = await prisma.produtoPlataforma.update({
    where: { id: produto.id },
    data: {
      ...(corpo.nome !== undefined && { nome: exigirTexto(corpo.nome, "nome") }),
      ...(corpo.categoria !== undefined && { categoria: exigirTexto(corpo.categoria, "categoria", 60) }),
      ...(precoCentavos !== undefined && { precoCentavos }),
      ...(quantidade !== undefined && { quantidade }),
      ...(peloGerencio && { sincronizadoEm: new Date() }),
      // O Gerêncio não conhece mais este ID: a plataforma passa a controlar o produto sozinha.
      ...(gerencio && !gerencio.vinculado && { sincronizadoEm: null }),
    },
  });
  return { ...formatarProduto(atualizado), ...(gerencio && { gerencio }) };
}

/**
 * O Gerêncio desfez o vínculo: o portal volta a controlar saldo e preço. Com zerarEstoque (produto
 * apagado no Gerêncio), o produto fica indisponível até o restaurante repor unidades.
 */
async function desvincularProdutoCatalogo(plataformaUrl: string, idExterno: string, zerarEstoque: boolean) {
  const produto = await buscarProdutoCatalogo(plataformaUrl, idExterno);
  return formatarProduto(await prisma.produtoPlataforma.update({
    where: { id: produto.id },
    data: { sincronizadoEm: null, ...(zerarEstoque && { quantidade: 0 }) },
  }));
}

async function removerProdutoCatalogo(plataformaUrl: string, idExterno: string) {
  const produto = await buscarProdutoCatalogo(plataformaUrl, idExterno);
  await prisma.produtoPlataforma.delete({ where: { id: produto.id } });
}

/**
 * Itens que existem no cardápio da plataforma usam o nome e o preço cadastrados nela e
 * precisam caber no estoque. Itens fora do cardápio (roteiros .http antigos) seguem como vieram.
 */
async function aplicarCatalogo(plataforma: Plataforma, itens: { codigoExterno: string; nome: string; quantidade: number; precoUnitarioCentavos: number }[]) {
  const produtos = await prisma.produtoPlataforma.findMany({
    where: { plataforma, idExterno: { in: itens.map((item) => item.codigoExterno) } },
  });
  const porCodigo = new Map(produtos.map((produto) => [produto.idExterno, produto]));
  const pedidas = new Map<string, number>();
  for (const item of itens) {
    const produto = porCodigo.get(item.codigoExterno);
    if (!produto) continue;
    item.nome = produto.nome;
    item.precoUnitarioCentavos = produto.precoCentavos;
    pedidas.set(produto.id, (pedidas.get(produto.id) ?? 0) + item.quantidade);
  }
  const baixas = produtos
    .filter((produto) => pedidas.has(produto.id))
    .map((produto) => ({ produto, quantidade: pedidas.get(produto.id)! }));
  for (const { produto, quantidade } of baixas) {
    if (quantidade > produto.quantidade) throw erroAcimaDoEstoque(plataforma, produto.nome, produto.quantidade);
  }
  return baixas;
}

function erroAcimaDoEstoque(plataforma: Plataforma, nome: string, disponivel: number) {
  if (disponivel === 0) return new ErroHttp(409, `${nome} está indisponível no ${NOME_PLATAFORMA[plataforma]}`);
  const unidades = disponivel === 1 ? "1 unidade disponível" : `${disponivel} unidades disponíveis`;
  return new ErroHttp(409, `Acima do limite do estoque: ${nome} tem ${unidades} no ${NOME_PLATAFORMA[plataforma]}`);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type ItemEntrada = {
  codigoExterno?: string | number;
  nome: string;
  quantidade: number;
  precoUnitarioCentavos: number;
  observacao?: string;
  complementos?: Prisma.InputJsonValue[];
};

async function criarPedido(corpo: any) {
  const plataforma = normalizarPlataforma(corpo.plataforma);
  if (!plataforma) throw new ErroHttp(400, `Plataforma inválida: ${JSON.stringify(corpo.plataforma)}`);
  const config = PLATAFORMAS[plataforma];

  const cliente = typeof corpo.cliente === "string" ? { nome: corpo.cliente } : corpo.cliente;
  if (!cliente?.nome || typeof cliente.nome !== "string") throw new ErroHttp(400, '"cliente.nome" é obrigatório');

  const tipo: TipoPedido = corpo.tipo === "RETIRADA" ? "RETIRADA" : "ENTREGA";
  const entreguePor: EntreguePor = corpo.entreguePor === "LOJA" ? "LOJA" : "PLATAFORMA";

  let endereco: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  if (tipo === "ENTREGA") {
    if (!corpo.endereco) throw new ErroHttp(400, '"endereco" é obrigatório para pedidos de entrega');
    endereco = typeof corpo.endereco === "string" ? { rua: corpo.endereco } : corpo.endereco;
  }

  if (!Array.isArray(corpo.itens) || corpo.itens.length === 0) {
    throw new ErroHttp(400, '"itens" deve ser uma lista não vazia');
  }
  const itens = (corpo.itens as ItemEntrada[]).map((item, i) => {
    if (!item?.nome) throw new ErroHttp(400, `"itens[${i}].nome" é obrigatório`);
    const quantidade = exigirInteiroNaoNegativo(item.quantidade, `itens[${i}].quantidade`);
    if (quantidade === 0) throw new ErroHttp(400, `"itens[${i}].quantidade" deve ser maior que 0`);
    return {
      codigoExterno: String(item.codigoExterno ?? i + 1),
      nome: item.nome,
      quantidade,
      precoUnitarioCentavos: exigirInteiroNaoNegativo(item.precoUnitarioCentavos, `itens[${i}].precoUnitarioCentavos`),
      ...(item.observacao ? { observacao: item.observacao } : {}),
      complementos: item.complementos ?? [],
    };
  });

  // Produtos do cardápio da plataforma: nome e preço vêm do cadastro e o estoque precisa ser suficiente
  const baixas = await aplicarCatalogo(plataforma, itens);

  const subtotalCentavos = itens.reduce((s, it) => s + it.quantidade * it.precoUnitarioCentavos, 0);
  const taxaEntregaCentavos = tipo === "ENTREGA" ? exigirInteiroNaoNegativo(corpo.taxaEntregaCentavos ?? 0, "taxaEntregaCentavos") : 0;
  const descontoPlataformaCentavos = exigirInteiroNaoNegativo(corpo.descontoPlataformaCentavos ?? 0, "descontoPlataformaCentavos");
  const descontoLojaCentavos = exigirInteiroNaoNegativo(corpo.descontoLojaCentavos ?? 0, "descontoLojaCentavos");
  const totalCentavos = Math.max(0, subtotalCentavos + taxaEntregaCentavos - descontoPlataformaCentavos - descontoLojaCentavos);

  const pagamento = corpo.pagamento ?? { pagoOnline: true, metodo: "CREDITO" };
  const agora = new Date();
  const idExterno = config.gerarIdExterno();
  const codigoExibicao = String(Math.floor(1000 + Math.random() * 9000));
  const lojaIdExterno = String(corpo.lojaIdExterno ?? config.lojaIdPadrao);

  const dadosPedido = {
    plataforma,
    idExterno,
    codigoExibicao,
    lojaIdExterno,
    restauranteId: String(corpo.restauranteId ?? RESTAURANTE_ID_PADRAO),
    status: config.statusInicial,
    tipo,
    agendadoPara: corpo.agendadoPara ? new Date(corpo.agendadoPara) : null,
    entreguePor,
    cliente,
    itens: itens as Prisma.InputJsonValue,
    subtotalCentavos,
    taxaEntregaCentavos,
    descontoPlataformaCentavos,
    descontoLojaCentavos,
    totalCentavos,
    pagamento,
    observacao: corpo.observacao ?? null,
    codigoColeta: entreguePor === "PLATAFORMA" ? String(Math.floor(1000 + Math.random() * 9000)) : null,
    prazoAceiteEm: new Date(agora.getTime() + config.prazoAceiteSegundos * 1000),
  };


 // Payload "nativo" devolvido no GET de detalhes. Os formatos exatos de cada
// plataforma podem ser montados nos módulos mock_backend/<plataforma>.
const enderecoJson = endereco === Prisma.DbNull ? null : endereco;

const pedidoRappi = plataforma === "RAPPI"
  ? montarPedidoRappi({ ...dadosPedido, itens, endereco: enderecoJson, criadoEm: agora })
  : null;

const pedidoIFood = plataforma === "IFOOD"
  ? montarPedidoIFood({ ...dadosPedido, itens, endereco: enderecoJson, criadoEm: agora })
  : null;

const pedido99 = plataforma === "NOVENTA_NOVE_FOOD"
  ? montarPedido99Food({ ...dadosPedido, itens, endereco: enderecoJson, criadoEm: agora })
  : null;

const pedidoUber = plataforma === "UBER_EATS"
  ? montarPedidoUber({ ...dadosPedido, itens, endereco: enderecoJson, criadoEm: agora })
  : null;

const payload = pedidoRappi ?? pedidoIFood ?? pedido99 ?? pedidoUber ?? { ...dadosPedido, id: idExterno, endereco: enderecoJson };

// Corpo exato do evento:
const payloadEvento = pedidoRappi
  ? [pedidoRappi]
  : pedidoIFood
  ? {
      id: randomUUID(),
      code: config.tipoEventoNovoPedido,
      fullCode: config.tipoEventoNovoPedido,
      orderId: idExterno,
      merchantId: lojaIdExterno,
      createdAt: agora.toISOString(),
    }
  : pedido99
  ? montarEventoNovoPedido99Food(pedido99)
  : { tipo: config.tipoEventoNovoPedido, pedidoId: idExterno, lojaId: lojaIdExterno, criadoEm: agora.toISOString() };
  
  // O pedido pago no app desconta o estoque da própria plataforma na mesma transação.
  // As outras plataformas recebem o novo saldo pelo Gerêncio, quando o restaurante aceita o pedido.
  const pedido = await prisma.$transaction(async (tx) => {
    for (const { produto, quantidade } of baixas) {
      const baixa = await tx.produtoPlataforma.updateMany({
        where: { id: produto.id, quantidade: { gte: quantidade } },
        data: { quantidade: { decrement: quantidade } },
      });
      if (baixa.count !== 1) {
        const atual = await tx.produtoPlataforma.findUnique({ where: { id: produto.id } });
        throw erroAcimaDoEstoque(plataforma, produto.nome, atual?.quantidade ?? 0);
      }
    }
    return tx.pedido.create({
      data: {
        ...dadosPedido,
        endereco,
        payload: payload as Prisma.InputJsonValue,
        eventos: {
          create: {
            plataforma,
            tipo: config.tipoEventoNovoPedido,
            canal: config.canal,
            payload: payloadEvento as Prisma.InputJsonValue,
          },
        },
      },
      include: { eventos: true },
    });
  });

  if (pedidoRappi) void notificarWebhookRappi(pedido.eventos[0]!.id, pedidoRappi);
  if (pedidoIFood) {
    void fetch(process.env["IFOOD_WEBHOOK_URL"] ?? "http://localhost:3005/api/webhooks/ifood", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([payloadEvento]),
    })
      .then((res) => {
        if (!res.ok) console.error(`[ifood] Webhook retornou status HTTP ${res.status}`);
      })
      .catch((erro) => console.error("[ifood] Erro ao disparar webhook automático:", erro));
  }

  if (pedidoUber) {
    const urlDestino = process.env["UBER_WEBHOOK_URL"] ?? "http://localhost:3005/api/webhooks/ubereats";
    void notificarWebhookUber(pedido.eventos[0]!.id, idExterno, lojaIdExterno, urlDestino);
  }

  if (pedido99) void notificarWebhook99Food(pedido.eventos[0]!.id, pedido99);
  
  return pedido;

}

async function notificarWebhookRappi(eventoId: string, pedidoRappi: Parameters<typeof dispararWebhookRappi>[0][number]) {
  const resultado = await dispararWebhookRappi([pedidoRappi]);
  if (!resultado.ok) console.warn(`[rappi] Webhook falhou (${resultado.statusHttp ?? resultado.erro})`);
  await prisma.evento
    .update({
      where: { id: eventoId },
      data: { tentativas: { increment: 1 }, ultimoStatusHttp: resultado.statusHttp, ...(resultado.ok ? { ackEm: new Date() } : {}) },
    })
    .catch((erro) => console.error("[rappi] Erro ao registrar tentativa do webhook:", erro));
}

export async function notificarWebhookUber(eventoId: string, pedidoIdExterno: string, lojaIdExterno: string, webhookUrl: string): Promise<void> {
  try {
    const response = await dispararWebhookUber(eventoId, pedidoIdExterno, webhookUrl, UBER_CLIENT_SECRET);

    if (response.ok) {
      await prisma.evento.update({
        where: { id: eventoId },
        data: { ackEm: new Date() }
      });

      const timer = setTimeout(async () => {
        await verificarTimeoutUber(pedidoIdExterno, lojaIdExterno, webhookUrl);
      }, 690 * 1000);

      uberTimers.set(pedidoIdExterno, timer);
    }
  } catch (error) {
    console.error(`[UBER_EATS] Erro ao processar webhook orders.notification (Evento: ${eventoId}):`, error);
  }
}

async function verificarTimeoutUber(pedidoIdExterno: string, lojaIdExterno: string, webhookUrl: string): Promise<void> {
  try {
    const pedido = await prisma.pedido.findUnique({
      where: {
        plataforma_idExterno: {
          plataforma: "UBER_EATS",
          idExterno: pedidoIdExterno
        }
      }
    });

    if (pedido && pedido.status === "CREATED") {
      const pedidoAtualizado = await prisma.pedido.update({
        where: { id: pedido.id },
        data: {
          status: "FAILED",
          eventos: {
            create: {
              plataforma: "UBER_EATS",
              tipo: "orders.failure",
              canal: "WEBHOOK",
              payload: {
                tipo: "orders.failure",
                pedidoId: pedidoIdExterno,
                status: "FAILED",
                criadoEm: new Date().toISOString()
              }
            }
          }
        },
        include: {
          eventos: {
            orderBy: { criadoEm: "desc" },
            take: 1
          }
        }
      });

      const eventoFalhaId = pedidoAtualizado.eventos[0]!.id;
      
      const response = await dispararWebhookFalhaUber(eventoFalhaId, pedidoIdExterno, lojaIdExterno, webhookUrl, UBER_CLIENT_SECRET);
      
      if (response.ok) {
        await prisma.evento.update({
          where: { id: eventoFalhaId },
          data: { ackEm: new Date() }
        });
      }
    }
  } catch (error) {
    console.error(`[UBER_EATS] Erro ao verificar timeout do pedido ${pedidoIdExterno}:`, error);
  }
}

/** Dispara o webhook do 99Food em segundo plano e registra a tentativa no evento. */
async function notificarWebhook99Food(eventoId: string, pedido99: Parameters<typeof dispararWebhook99Food>[0]) {
  const resultado = await dispararWebhook99Food(pedido99);
  if (!resultado.ok) console.warn(`[99food] Webhook falhou (${resultado.statusHttp ?? resultado.erro})`);
  await prisma.evento
    .update({
      where: { id: eventoId },
      data: { tentativas: { increment: 1 }, ultimoStatusHttp: resultado.statusHttp, ...(resultado.ok ? { ackEm: new Date() } : {}) },
    })
    .catch((erro) => console.error("[99food] Erro ao registrar tentativa do webhook:", erro));
}

async function listarPedidos(params: URLSearchParams) {
  const where: Prisma.PedidoWhereInput = {};
  const plataforma = params.get("plataforma");
  if (plataforma) {
    const p = normalizarPlataforma(plataforma);
    if (!p) throw new ErroHttp(400, `Plataforma inválida: ${plataforma}`);
    where.plataforma = p;
  }
  if (params.get("status")) where.status = params.get("status")!;
  if (params.get("restauranteId")) where.restauranteId = params.get("restauranteId")!;

  return prisma.pedido.findMany({ where, orderBy: { criadoEm: "desc" }, take: Math.min(Number(params.get("limite") ?? 50), 200) });
}

async function buscarPedido(id: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id }, include: { eventos: { orderBy: { criadoEm: "asc" } } } });
  if (!pedido) throw new ErroHttp(404, "Pedido não encontrado");
  return pedido;
}

async function atualizarStatus(id: string, corpo: any) {
  if (!corpo.status || typeof corpo.status !== "string") throw new ErroHttp(400, '"status" é obrigatório');
  const pedido = await buscarPedido(id);
  const tipoEvento = typeof corpo.tipoEvento === "string" ? corpo.tipoEvento : corpo.status;

  return prisma.pedido.update({
    where: { id },
    data: {
      status: corpo.status,
      eventos: {
        create: {
          plataforma: pedido.plataforma,
          tipo: tipoEvento,
          canal: PLATAFORMAS[pedido.plataforma].canal,
          payload: { tipo: tipoEvento, pedidoId: pedido.idExterno, status: corpo.status, criadoEm: new Date().toISOString() },
        },
      },
    },
    include: { eventos: { orderBy: { criadoEm: "asc" } } },
  });
}

async function removerPedido(id: string) {
  await buscarPedido(id);
  await prisma.pedido.delete({ where: { id } });
}

async function listarEventos(params: URLSearchParams) {
  const where: Prisma.EventoWhereInput = {};
  const plataforma = params.get("plataforma");
  if (plataforma) {
    const p = normalizarPlataforma(plataforma);
    if (!p) throw new ErroHttp(400, `Plataforma inválida: ${plataforma}`);
    where.plataforma = p;
  }
  const canal = params.get("canal");
  if (canal === "WEBHOOK" || canal === "POLLING") where.canal = canal;
  if (params.get("pendentes") === "true") where.ackEm = null;

  return prisma.evento.findMany({ where, orderBy: { criadoEm: "asc" }, take: Math.min(Number(params.get("limite") ?? 100), 500) });
}

async function confirmarEvento(id: string) {
  const evento = await prisma.evento.findUnique({ where: { id } });
  if (!evento) throw new ErroHttp(404, "Evento não encontrado");
  return prisma.evento.update({ where: { id }, data: { ackEm: evento.ackEm ?? new Date() } });
}

// ---------------------------------------------------------------------------
// Roteamento
// ---------------------------------------------------------------------------

const UUID = "([0-9a-fA-F-]{36})";

async function rotear(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const { pathname, searchParams } = url;
  const metodo = req.method ?? "GET";
  let m: RegExpMatchArray | null;

  if (metodo === "POST" && pathname === "/oauth/v2/token") {
    return enviarJson(res, 200, {
      access_token: randomUUID(),
      token_type: "Bearer",
      expires_in: 2592000
    });
  }

  if (metodo === "GET" && pathname === "/health") {
    await prisma.$queryRaw`SELECT 1`;
    return enviarJson(res, 200, { ok: true });
  }
  if (metodo === "GET" && pathname === "/plataformas") {
    return enviarJson(res, 200, Object.keys(PLATAFORMAS));
  }

  // ---------------------------------------------------------------------------
  // Catálogo de cada plataforma (portal do restaurante, cardápio do cliente e sincronização do Gerêncio)
  // ---------------------------------------------------------------------------
  if (pathname === "/catalogo") {
    if (metodo === "GET") return enviarJson(res, 200, await listarCatalogo(searchParams));
    if (metodo === "POST") return enviarJson(res, 201, await criarProdutoCatalogo(await lerCorpo(req)));
  }
  if ((m = pathname.match(/^\/catalogo\/([^/]+)\/([^/]+)\/vinculo$/)) && metodo === "DELETE") {
    const zerarEstoque = searchParams.get("zerarEstoque") === "1";
    return enviarJson(res, 200, await desvincularProdutoCatalogo(decodeURIComponent(m[1]!), decodeURIComponent(m[2]!), zerarEstoque));
  }
  if ((m = pathname.match(/^\/catalogo\/([^/]+)\/([^/]+)$/))) {
    const [plataformaUrl, idExterno] = [decodeURIComponent(m[1]!), decodeURIComponent(m[2]!)];
    if (metodo === "GET") return enviarJson(res, 200, formatarProduto(await buscarProdutoCatalogo(plataformaUrl, idExterno)));
    if (metodo === "PATCH") return enviarJson(res, 200, await atualizarProdutoCatalogo(plataformaUrl, idExterno, await lerCorpo(req)));
    if (metodo === "DELETE") {
      await removerProdutoCatalogo(plataformaUrl, idExterno);
      return enviarJson(res, 204);
    }
  }

  // ---------------------------------------------------------------------------
  // Endpoints da API iFood Merchant v1.0 (Polling)
  // ---------------------------------------------------------------------------
  if (pathname === "/v1.0/events:poll" && metodo === "GET") {
    const eventosPendentes = await prisma.evento.findMany({
      where: { plataforma: "IFOOD", canal: "POLLING", ackEm: null },
      orderBy: { criadoEm: "asc" },
      take: 50,
    });

    if (eventosPendentes.length === 0) {
      return enviarJson(res, 200, []);
    }

    const eventosIFood = eventosPendentes.map((e) => e.payload);
    return enviarJson(res, 200, eventosIFood);
  }

  if (pathname === "/v1.0/events/acknowledgment" && metodo === "POST") {
    const ackList = await lerCorpo(req);
    if (Array.isArray(ackList)) {
      for (const item of ackList) {
        const orderId = item.orderId;
        const id = item.id;
        if (id || orderId) {
          await prisma.evento.updateMany({
            where: {
              plataforma: "IFOOD",
              ackEm: null,
            },
            data: { ackEm: new Date() },
          });
        }
      }
    }
    return enviarJson(res, 202);
  }

  if ((m = pathname.match(new RegExp(`^/v1.0/orders/${UUID}$`))) && metodo === "GET") {
    const pedido = await prisma.pedido.findFirst({
      where: { idExterno: m[1], plataforma: "IFOOD" },
    });
    if (!pedido) throw new ErroHttp(404, "Pedido iFood não encontrado");
    return enviarJson(res, 200, pedido.payload);
  }

  // ---------------------------------------------------------------------------
  // Endpoints genéricos do Mock
  // ---------------------------------------------------------------------------
  if (pathname === "/pedidos") {
    if (metodo === "GET") return enviarJson(res, 200, await listarPedidos(searchParams));
    if (metodo === "POST") return enviarJson(res, 201, await criarPedido(await lerCorpo(req)));
  }
  if ((m = pathname.match(new RegExp(`^/pedidos/${UUID}$`)))) {
    if (metodo === "GET") return enviarJson(res, 200, await buscarPedido(m[1]!));
    if (metodo === "DELETE") {
      await removerPedido(m[1]!);
      return enviarJson(res, 204);
    }
  }
  if ((m = pathname.match(new RegExp(`^/pedidos/${UUID}/status$`))) && metodo === "PATCH") {
    return enviarJson(res, 200, await atualizarStatus(m[1]!, await lerCorpo(req)));
  }

  if (pathname === "/eventos" && metodo === "GET") {
    return enviarJson(res, 200, await listarEventos(searchParams));
  }
  if ((m = pathname.match(new RegExp(`^/eventos/${UUID}/ack$`))) && metodo === "POST") {
    return enviarJson(res, 200, await confirmarEvento(m[1]!));
  }

  if ((m = pathname.match(new RegExp(`^/v2/eats/order/${UUID}$`))) && metodo === "GET") {
    const pedido = await prisma.pedido.findFirst({
      where: { 
        idExterno: m[1], 
        plataforma: "UBER_EATS" 
      }
    });

    if (!pedido) throw new ErroHttp(404, "Pedido não encontrado");
    
    return enviarJson(res, 200, pedido.payload);
  }

  if ((m = pathname.match(new RegExp(`^/v1/eats/orders/${UUID}/accept_pos_order$`))) && metodo === "POST") {
    const pedidoIdExterno = m[1]!;

    if (uberTimers.has(pedidoIdExterno)) {
      clearTimeout(uberTimers.get(pedidoIdExterno));
      uberTimers.delete(pedidoIdExterno);
    }

    const pedido = await prisma.pedido.findFirst({
      where: { idExterno: pedidoIdExterno, plataforma: "UBER_EATS" }
    });

    if (!pedido) throw new ErroHttp(404, "Pedido não encontrado");

    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        status: "ACCEPTED",
        eventos: {
          create: {
            plataforma: "UBER_EATS",
            tipo: "ACCEPTED",
            canal: "WEBHOOK",
            payload: { 
              tipo: "ACCEPTED", 
              pedidoId: pedidoIdExterno, 
              status: "ACCEPTED", 
              criadoEm: new Date().toISOString() 
            }
          }
        }
      }
    });

    res.writeHead(204);
    return res.end();
  }

  if ((m = pathname.match(new RegExp(`^/v1/eats/orders/${UUID}/deny_pos_order$`))) && metodo === "POST") {
    const pedidoIdExterno = m[1]!;
    const corpo = await lerCorpo(req);

    if (uberTimers.has(pedidoIdExterno)) {
      clearTimeout(uberTimers.get(pedidoIdExterno));
      uberTimers.delete(pedidoIdExterno);
    }

    const pedido = await prisma.pedido.findFirst({
      where: { idExterno: pedidoIdExterno, plataforma: "UBER_EATS" }
    });

    if (!pedido) throw new ErroHttp(404, "Pedido não encontrado");

    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        status: "DENIED",
        eventos: {
          create: {
            plataforma: "UBER_EATS",
            tipo: "DENIED",
            canal: "WEBHOOK",
            payload: {
              tipo: "DENIED",
              pedidoId: pedidoIdExterno,
              status: "DENIED",
              deny_reason: corpo.deny_reason,
              criadoEm: new Date().toISOString()
            }
          }
        }
      }
    });

    res.writeHead(204);
    return res.end();
  }

  throw new ErroHttp(404, `Rota não encontrada: ${metodo} ${pathname}`);
}

const servidor = createServer(async (req, res) => {
  aplicarCors(res);
  if (req.method === "OPTIONS") return enviarJson(res, 204);

  try {
    await rotear(req, res);
  } catch (erro) {
    if (erro instanceof ErroHttp) return enviarJson(res, erro.status, { erro: erro.message });
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return enviarJson(res, 409, { erro: "Pedido duplicado para esta plataforma" });
    }
    console.error(erro);
    enviarJson(res, 500, { erro: "Erro interno" });
  }
});

servidor.listen(PORTA, () => {
  console.log(`Mock API ouvindo em http://localhost:${PORTA}`);
});

async function encerrar() {
  servidor.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);