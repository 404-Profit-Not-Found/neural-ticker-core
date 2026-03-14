import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface PriceAlert {
  id: string;
  user_id: string;
  ticker_id: string;
  symbol: string;
  alert_type: 'price_above' | 'price_below' | 'percent_change_up' | 'percent_change_down';
  target_value: number;
  reference_price: number | null;
  enabled: boolean;
  triggered_at: string | null;
  cooldown_minutes: number;
  created_at: string;
  updated_at: string;
  ticker?: {
    symbol: string;
    name: string;
    logo_url?: string;
  };
}

export interface CreatePriceAlertDto {
  symbol: string;
  alert_type: PriceAlert['alert_type'];
  target_value: number;
  cooldown_minutes?: number;
}

export const alertKeys = {
  all: ['price-alerts'] as const,
};

/**
 * Fetch all price alerts for the current user.
 */
export function usePriceAlerts() {
  return useQuery({
    queryKey: alertKeys.all,
    queryFn: async () => {
      const { data } = await api.get<PriceAlert[]>('/price-alerts');
      return data;
    },
    staleTime: 60_000,
  });
}

/**
 * Create a new price alert.
 */
export function useCreatePriceAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreatePriceAlertDto) => {
      const { data } = await api.post<PriceAlert>('/price-alerts', dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
    },
  });
}

/**
 * Delete a price alert.
 */
export function useDeletePriceAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/price-alerts/${id}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: alertKeys.all });
      const previous = queryClient.getQueryData<PriceAlert[]>(alertKeys.all);
      queryClient.setQueryData<PriceAlert[]>(alertKeys.all, (old) =>
        old ? old.filter((a) => a.id !== id) : [],
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(alertKeys.all, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
    },
  });
}

/**
 * Toggle a price alert's enabled state.
 */
export function useTogglePriceAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { data } = await api.patch<PriceAlert>(`/price-alerts/${id}`, { enabled });
      return data;
    },
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: alertKeys.all });
      const previous = queryClient.getQueryData<PriceAlert[]>(alertKeys.all);
      queryClient.setQueryData<PriceAlert[]>(alertKeys.all, (old) =>
        old ? old.map((a) => (a.id === id ? { ...a, enabled } : a)) : [],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(alertKeys.all, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
    },
  });
}
