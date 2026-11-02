import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'qrcode';

import { Paleta, Raio } from '@/constants/tokens';

/**
 * QR Code desenhado com Views (sem SVG nem canvas), igual na web e no celular.
 * Módulos escuros vizinhos viram um único bloco por linha para reduzir a quantidade de Views.
 * Preto no branco em qualquer tema: leitores de QR falham com cores invertidas.
 */
export function QrCode({ valor, tamanho = 220 }: { valor: string; tamanho?: number }) {
  const { linhas, modulo } = useMemo(() => {
    const { modules } = QRCode.create(valor, { errorCorrectionLevel: 'L' });
    const lado = modules.size;
    const resultado: { inicio: number; largura: number }[][] = [];
    for (let linha = 0; linha < lado; linha++) {
      const blocos: { inicio: number; largura: number }[] = [];
      let coluna = 0;
      while (coluna < lado) {
        if (!modules.get(linha, coluna)) { coluna++; continue; }
        const inicio = coluna;
        while (coluna < lado && modules.get(linha, coluna)) coluna++;
        blocos.push({ inicio, largura: coluna - inicio });
      }
      resultado.push(blocos);
    }
    return { linhas: resultado, modulo: Math.max(1, Math.floor(tamanho / lado)) };
  }, [valor, tamanho]);

  const lado = linhas.length * modulo;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="QR Code do link de pagamento"
      style={styles.moldura}>
      <View style={{ width: lado, height: lado }}>
        {linhas.map((blocos, linha) =>
          blocos.map(({ inicio, largura }) => (
            <View
              key={`${linha}-${inicio}`}
              style={[
                styles.bloco,
                { top: linha * modulo, left: inicio * modulo, width: largura * modulo, height: modulo },
              ]}
            />
          )),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  moldura: {
    alignSelf: 'center',
    // Zona de silêncio exigida pelo padrão QR (4 módulos), aproximada em pixels
    padding: 16,
    borderRadius: Raio.small,
    backgroundColor: Paleta.branco,
  },
  bloco: {
    position: 'absolute',
    backgroundColor: Paleta.preto,
  },
});
