import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Pagina, useLarguraConteudo } from '@/components/dashboard/pagina';
import { RotaFormulario } from '@/components/dashboard/rota-formulario';
import { RotaMapa } from '@/components/dashboard/rota-mapa';
import { RotaParadas } from '@/components/dashboard/rota-paradas';
import { RotaResumo } from '@/components/dashboard/rota-resumo';
import { Chip, Texto } from '@/components/dashboard/ui';
import { Espacamento } from '@/constants/tokens';
import {
  PARADAS_EXEMPLO, PARTIDA_EXEMPLO, type MeioTransporte, type Parada, type PontoPartida,
} from '@/data/rotas';

export default function PlanejarRota() {
  const largura = useLarguraConteudo();
  const duasColunas = largura >= 800;

  const [nome, setNome] = useState('Rota Centro');
  const [transporte, setTransporte] = useState<MeioTransporte>('moto');
  const [partida, setPartida] = useState<PontoPartida>(PARTIDA_EXEMPLO);
  const [paradas, setParadas] = useState<Parada[]>(PARADAS_EXEMPLO);

  const [noMapa, setNoMapa] = useState<{ partida: PontoPartida; paradas: Parada[] }>({
    partida: PARTIDA_EXEMPLO,
    paradas: PARADAS_EXEMPLO,
  });

  return (
    <Pagina
      titulo="Planejar rota"
      subtitulo="Insira os endereços na ordem de entrega e confira o percurso no mapa."
      acao={<Chip rotulo="Exemplo preenchido" />}>
      <RotaFormulario nome={nome} onNome={setNome} transporte={transporte} onTransporte={setTransporte} />

      <View style={[styles.colunas, duasColunas && styles.colunasLado]}>
        <View style={duasColunas ? styles.esquerda : styles.coluna}>
          <RotaParadas
            partida={partida}
            onPartida={setPartida}
            paradas={paradas}
            onParadas={setParadas}
            onVisualizar={() => setNoMapa({ partida, paradas })}
          />
        </View>
        <View style={duasColunas ? styles.direita : styles.coluna}>
          <RotaMapa paradas={noMapa.paradas} altura={duasColunas ? 460 : 340} />
          <RotaResumo partida={noMapa.partida} paradas={noMapa.paradas} />
        </View>
      </View>

      <Texto tamanho={13} cor="textoSecundario">
        Dados demonstrativos • não representam uma operação real.
      </Texto>
    </Pagina>
  );
}

const styles = StyleSheet.create({
  colunas: { gap: Espacamento.large },
  colunasLado: { flexDirection: 'row', alignItems: 'flex-start' },
  coluna: { gap: Espacamento.large },
  esquerda: { flex: 4, minWidth: 340 },
  direita: { flex: 7, gap: Espacamento.large },
});
