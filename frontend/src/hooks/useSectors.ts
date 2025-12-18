import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useSectors() {
  return useQuery<string[]>({
    queryKey: ['tickers', 'sectors'],
    queryFn: async () => {
      const { data } = await api.get('/tickers/sectors');
      return data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour - sectors don't change often
  });
}
