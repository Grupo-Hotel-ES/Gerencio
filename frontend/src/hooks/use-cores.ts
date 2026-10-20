import { Cores, type CoresTema } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useCores(): CoresTema {
  const scheme = useColorScheme();
  return Cores[scheme === 'dark' ? 'dark' : 'light'];
}
