import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Botao, Etiqueta, Icone, Texto } from './ui';

import { Espacamento, Raio } from '@/constants/tokens';
import { formatarHora } from '@/data/pedidos';
import { usePerfil } from '@/data/perfil-context';
import { useCores } from '@/hooks/use-cores';
import { useEstadoOffline } from '@/services/cache-offline';
import { sincronizarFilaOffline, useFilaOffline } from '@/services/fila-offline';

function formatarAgora(agora: Date) {
  const data = agora.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
  return `Hoje, ${data.replace(/ de /g, ' ')} • ${formatarHora(agora)}`;
}

function formatarRotuloOffline(ultimoCacheUsadoEm: string | null) {
  if (!ultimoCacheUsadoEm) return 'Modo offline';
  const data = new Date(ultimoCacheUsadoEm);
  if (Number.isNaN(data.getTime())) return 'Modo offline';
  return `Modo offline • dados de ${formatarHora(data)}`;
}

export function TopBar() {
  const cores = useCores();
  const { perfil, iniciais } = usePerfil();
  const estadoOffline = useEstadoOffline();
  const filaOffline = useFilaOffline();

  // Preenchido só no cliente para não divergir do HTML gerado na renderização estática.
  const [agora, setAgora] = useState<Date | null>(null);

  useEffect(() => {
    setAgora(new Date());
    const intervalo = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(intervalo);
  }, []);

  const emModoOffline = !estadoOffline.online || estadoOffline.usandoCacheOffline;

  return (
    <View style={[styles.container, { backgroundColor: cores.superficie }]}>
      <Texto tamanho={16} peso={500}>
        {perfil?.nomeRestaurante ?? ''}
      </Texto>
      {perfil && (
        <Etiqueta
          rotulo={perfil.lojaAberta ? 'Loja aberta' : 'Loja fechada'}
          corPonto={perfil.lojaAberta ? cores.statusEntregue : cores.statusCancelado}
        />
      )}
      {emModoOffline && (
        <Etiqueta
          rotulo={formatarRotuloOffline(estadoOffline.ultimoCacheUsadoEm)}
          corPonto={cores.statusPreparando}
        />
      )}
      {filaOffline.pendentes > 0 && (
        <Botao
          rotulo={
            filaOffline.sincronizando
              ? 'Sincronizando…'
              : `Fila offline: ${filaOffline.pendentes} pendente${filaOffline.pendentes === 1 ? '' : 's'}`
          }
          icone="sincronizar"
          disabled={filaOffline.sincronizando}
          onPress={() => {
            void sincronizarFilaOffline();
          }}
        />
      )}
      {filaOffline.conflitos > 0 && (
        <Etiqueta
          rotulo={`${filaOffline.conflitos} conflito${filaOffline.conflitos === 1 ? '' : 's'} de estoque`}
          corPonto={cores.feedbackErro}
        />
      )}

      <View style={styles.direita}>
        <Texto tamanho={13} cor="textoSecundario">
          {agora ? formatarAgora(agora) : ''}
        </Texto>
        <Pressable accessibilityRole="button" accessibilityLabel="Notificações">
          <Icone nome="sino" />
        </Pressable>
        <Link href="/perfil" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Perfil de ${perfil?.nomeCompleto ?? ''}`}
            style={StyleSheet.flatten([styles.avatar, { backgroundColor: cores.brand }])}>
            <Texto peso={600} cor="textOnBrand">
              {iniciais}
            </Texto>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.medium,
    height: 68,
    paddingHorizontal: Espacamento.large,
  },
  direita: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacamento.large,
    marginLeft: 'auto',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: Raio.small,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer' as any,
  },
});
