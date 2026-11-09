import * as Print from 'expo-print';

/**
 * Abre a impressão do sistema com o HTML. Nela dá para salvar como PDF
 * (Android) ou compartilhar o PDF (iOS). Na web, ver exportar-pdf.web.ts.
 */
export async function exportarPdf(html: string): Promise<void> {
  // A4 em pontos (72 por polegada)
  await Print.printAsync({ html, width: 595, height: 842 });
}
