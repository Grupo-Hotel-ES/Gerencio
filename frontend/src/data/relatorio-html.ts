import { Cores } from '@/constants/tokens';
import { formatarReais } from '@/data/pedidos';
import type { RelatorioVendas } from '@/services/api-relatorios';

// O PDF é sempre impresso no tema claro.
const cores = Cores.light;

type DadosRelatorioPdf = {
  relatorio: RelatorioVendas;
  /** Período por extenso, como aparece na tela (ex.: "03–09 nov 2026"). */
  periodo: string;
  restaurante: string;
  geradoEm: Date;
};

function escapar(texto: string) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dataCurta(data: Date) {
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function plural(quantidade: number, singular: string, varios: string) {
  return `${quantidade} ${quantidade === 1 ? singular : varios}`;
}

/** Nome do arquivo sugerido ao salvar (ex.: "relatorio-vendas-2026-11-03-a-2026-11-09"). */
export function nomeArquivoRelatorio(inicio: Date, fim: Date) {
  const dia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return inicio.getTime() === fim.getTime()
    ? `relatorio-vendas-${dia(inicio)}`
    : `relatorio-vendas-${dia(inicio)}-a-${dia(fim)}`;
}

/** Relatório de vendas em HTML pronto para imprimir em A4 (usado para gerar o PDF). */
export function gerarHtmlRelatorio({ relatorio, periodo, restaurante, geradoEm }: DadosRelatorioPdf, titulo: string) {
  const { receitaTotal, pedidosConcluidos, ticketMedio, receitaPorDia, receitaPorCanal, itensMaisPedidos } = relatorio;
  const maiorReceita = Math.max(0, ...receitaPorDia.map((d) => d.receita));
  const melhorDia = receitaPorDia.reduce((melhor, dia) => (dia.receita > melhor.receita ? dia : melhor), receitaPorDia[0]);
  const lider = itensMaisPedidos.at(0);
  const semVendas = pedidosConcluidos === 0;

  const barras = receitaPorDia
    .map(({ receita }) => {
      const altura = maiorReceita > 0 ? Math.max(1, (receita / maiorReceita) * 100) : 1;
      const cor = receita > 0 ? cores.brand : cores.borda;
      return `<div class="barra"><div class="valor" style="height:${altura}%;background:${cor}"></div></div>`;
    })
    .join('');

  const linhasDias = receitaPorDia
    .map(({ data, receita }) => `<tr><td>${dataCurta(data)}</td><td>${data.toLocaleDateString('pt-BR', { weekday: 'long' })}</td><td class="num">${formatarReais(receita)}</td></tr>`)
    .join('');

  const linhasCanais = receitaPorCanal
    .map(({ canal, pedidos, receita }) => `<tr><td>${escapar(canal)}</td><td class="num">${pedidos}</td><td class="num">${formatarReais(receita)}</td><td class="num">${receitaTotal > 0 ? ((receita / receitaTotal) * 100).toFixed(1).replace('.', ',') : '0,0'}%</td></tr>`)
    .join('');

  const linhasItens = itensMaisPedidos
    .map((item, indice) => `<tr><td class="num">${indice + 1}</td><td>${escapar(item.nome)}</td><td class="num">${item.unidades}</td><td class="num">${formatarReais(item.receita)}</td></tr>`)
    .join('');

  const destaques: string[] = [];
  if (!semVendas && receitaPorDia.length > 1 && melhorDia) {
    destaques.push(`<li><strong>Melhor dia:</strong> ${melhorDia.data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}, com ${formatarReais(melhorDia.receita)} (${((melhorDia.receita / receitaTotal) * 100).toFixed(1).replace('.', ',')}% da receita).</li>`);
  }
  if (lider) destaques.push(`<li><strong>Mais vendido:</strong> ${escapar(lider.nome)}, com ${plural(lider.unidades, 'unidade', 'unidades')}.</li>`);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapar(titulo)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11pt; color: ${cores.textoPrincipal}; background: ${cores.superficie}; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid ${cores.brand}; padding-bottom: 8pt; margin-bottom: 14pt; }
  h1 { font-size: 20pt; margin: 0 0 2pt; }
  h2 { font-size: 13pt; margin: 18pt 0 6pt; break-after: avoid; }
  .bloco { break-inside: avoid; }
  .sub { color: ${cores.textoSecundario}; font-size: 10pt; }
  .resumo { display: flex; gap: 8pt; }
  .cartao { flex: 1; border: 1px solid ${cores.borda}; border-radius: 6pt; padding: 8pt 10pt; }
  .cartao .rotulo { color: ${cores.textoSecundario}; font-size: 9pt; }
  .cartao .numero { font-size: 16pt; font-weight: 600; margin-top: 2pt; }
  .grafico { display: flex; align-items: flex-end; gap: 2pt; height: 90pt; border-bottom: 1px solid ${cores.borda}; margin-bottom: 6pt; }
  .barra { flex: 1; height: 100%; display: flex; align-items: flex-end; }
  .valor { width: 100%; border-radius: 2pt 2pt 0 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 4pt 6pt; border-bottom: 1px solid ${cores.borda}; }
  th { color: ${cores.textoSecundario}; font-weight: 600; font-size: 9pt; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: 600; border-bottom: none; }
  tr { break-inside: avoid; }
  ul { margin: 0; padding-left: 16pt; }
  footer { margin-top: 18pt; color: ${cores.textoSecundario}; font-size: 8.5pt; }
</style>
</head>
<body>
<header>
  <div>
    <h1>Relatório de vendas</h1>
    <div class="sub">${escapar(restaurante)}</div>
  </div>
  <div class="sub">Período: <strong>${escapar(periodo)}</strong></div>
</header>

<div class="resumo">
  <div class="cartao"><div class="rotulo">Receita gerada</div><div class="numero">${formatarReais(receitaTotal)}</div></div>
  <div class="cartao"><div class="rotulo">Pedidos concluídos</div><div class="numero">${pedidosConcluidos}</div></div>
  <div class="cartao"><div class="rotulo">Ticket médio</div><div class="numero">${formatarReais(ticketMedio)}</div></div>
</div>

${semVendas ? '<p class="sub">Nenhum pedido concluído no período.</p>' : `
<h2>Receita por dia</h2>
<div class="grafico">${barras}</div>
<table>
  <thead><tr><th>Dia</th><th>Dia da semana</th><th class="num">Receita</th></tr></thead>
  <tbody>${linhasDias}</tbody>
  <tfoot><tr><td colspan="2">Total de ${plural(receitaPorDia.length, 'dia', 'dias')}</td><td class="num">${formatarReais(receitaTotal)}</td></tr></tfoot>
</table>

<h2>Receita por canal</h2>
<table>
  <thead><tr><th>Canal</th><th class="num">Pedidos</th><th class="num">Receita</th><th class="num">Participação</th></tr></thead>
  <tbody>${linhasCanais}</tbody>
  <tfoot><tr><td>Total</td><td class="num">${pedidosConcluidos}</td><td class="num">${formatarReais(receitaTotal)}</td><td class="num">100%</td></tr></tfoot>
</table>

<h2>Itens mais pedidos</h2>
<table>
  <thead><tr><th class="num">#</th><th>Produto</th><th class="num">Unidades</th><th class="num">Receita</th></tr></thead>
  <tbody>${linhasItens}</tbody>
</table>

${destaques.length > 0 ? `<div class="bloco"><h2>Destaques do período</h2><ul>${destaques.join('')}</ul></div>` : ''}
`}

<footer class="bloco">
  Pedidos concluídos no período; cancelamentos não entram no cálculo. O valor de cada item usa o preço atual do produto no cardápio.<br>
  Gerado pelo Gerôncio em ${geradoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.
</footer>
</body>
</html>`;
}
