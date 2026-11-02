import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { SessaoProvider } from '@/data/sessao';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Head>
        <title>Gerêncio</title>
      </Head>
      <AnimatedSplashOverlay />
      <SessaoProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </SessaoProvider>
    </ThemeProvider>
  );
}
