import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from 'sonner';

export function useRequestTicker() {
    return useMutation({
        mutationFn: async (symbol: string) => {
            const { data } = await api.post('/ticker-requests', { symbol });
            return data;
        },
        onSuccess: (_, symbol) => {
            toast.success(`Request for ${symbol} submitted successfully.`);
        },
        onError: (error: Error & { response?: { data?: { message?: string } } }) => {
            toast.error(error.response?.data?.message || error.message || 'Failed to submit request');
        },
    });
}
