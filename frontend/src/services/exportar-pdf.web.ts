/**
 * Na web, o expo-print imprime a página inteira. Aqui o HTML vai para um iframe
 * invisível e só ele é impresso; na janela de impressão, "Salvar como PDF" gera
 * o arquivo, com o <title> do HTML como nome sugerido.
 */
export async function exportarPdf(html: string): Promise<void> {
  const quadro = document.createElement('iframe');
  quadro.setAttribute('aria-hidden', 'true');
  Object.assign(quadro.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });

  const carregado = new Promise<void>((resolve) => { quadro.onload = () => resolve(); });
  quadro.srcdoc = html;
  document.body.appendChild(quadro);
  await carregado;

  const janela = quadro.contentWindow;
  if (!janela) {
    quadro.remove();
    throw new Error('Não foi possível abrir a impressão do relatório.');
  }

  // Remove o iframe quando a janela de impressão fecha (ou depois de um tempo, por garantia)
  const remover = () => quadro.remove();
  janela.addEventListener('afterprint', remover, { once: true });
  setTimeout(remover, 60_000);

  janela.focus();
  janela.print();
}
