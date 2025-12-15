import { api } from '../lib/api';

export interface CreditTransaction {
  id: string;
  amount: number;
  reason: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  tier: 'free' | 'pro' | 'admin';
  credits_balance: number;
  credits_reset_at: string | null;
  credit_transactions: CreditTransaction[];
}

export const UserService = {
  getProfile: async () => {
    const { data } = await api.get<UserProfile>('/users/me');
    return data;
  },
};
