import { nomeDoCanal, requisitar } from '@/services/api-pedidos';

/** Relatório de vendas de um período, como devolvido pela api-pedidos. */
export type RelatorioVendas = {
  receitaTotal: number;
  pedidosConcluidos: number;
  ticketMedio: number;
  /** Um registro por dia do período, inclusive os dias sem vendas. */
  receitaPorDia: { data: Date; receita: number }[];
  /** Do canal que mais faturou para o que menos faturou. */
  receitaPorCanal: { canal: string; pedidos: number; receita: number }[];
  /** Do produto mais vendido para o menos vendido. */
  itensMaisPedidos: { produtoId: number; nome: string; unidades: number; receita: number }[];
};

type RelatorioVendasApi = Omit<RelatorioVendas, 'receitaPorDia' | 'receitaPorCanal'> & {
  receitaPorDia: { data: string; receita: number }[];
  receitaPorCanal: { app: string; pedidos: number; receita: number }[];
};

/** Formata a data local como AAAA-MM-DD, o formato esperado pela API. */
export function paraDiaApi(data: Date) {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

function deDiaApi(dia: string) {
  const [ano, mes, diaDoMes] = dia.split('-').map(Number);
  return new Date(ano, mes - 1, diaDoMes);
}

export async function buscarRelatorioVendas(inicio: Date, fim: Date): Promise<RelatorioVendas> {
  const relatorio = await requisitar<RelatorioVendasApi>(
    `/relatorios/vendas?inicio=${paraDiaApi(inicio)}&fim=${paraDiaApi(fim)}`,
  );
  return {
    ...relatorio,
    receitaPorDia: relatorio.receitaPorDia.map((dia) => ({ ...dia, data: deDiaApi(dia.data) })),
    receitaPorCanal: relatorio.receitaPorCanal.map(({ app, ...canal }) => ({
      ...canal,
      canal: nomeDoCanal(app),
    })),
  };
}
