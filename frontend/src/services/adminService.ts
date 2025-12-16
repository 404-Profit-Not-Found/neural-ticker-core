import { api } from '../lib/api';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  last_login: string;
}

export interface AllowedUser {
  id: string;
  email: string;
  added_by: string;
  created_at: string;
}

// Helper to handle admin API errors
const handleAdminError = (error: unknown) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = error as any;
  if (err.response?.status === 403 || err.response?.status === 401) {
    throw new Error('Access denied. Admin privileges required.');
  }
  throw error;
};

export const AdminService = {
  getUsers: async () => {
    try {
      const { data } = await api.get<User[]>('/admin/users');
      return data;
    } catch (error) {
      handleAdminError(error);
      throw error;
    }
  },

  getUserlist: async () => {
    try {
      const { data } = await api.get<AllowedUser[]>('/admin/userlist');
      return data;
    } catch (error) {
      handleAdminError(error);
      throw error;
    }
  },

  getIdentities: async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await api.get<any[]>('/admin/identities');
      return data;
    } catch (error) {
      handleAdminError(error);
      throw error;
    }
  },

  addToUserlist: async (email: string) => {
    try {
      const { data } = await api.post<AllowedUser>('/admin/userlist', {
        email,
      });
      return data;
    } catch (error) {
      handleAdminError(error);
      throw error;
    }
  },

  revokeAccess: async (email: string) => {
    try {
      return await api.delete(`/admin/userlist/${encodeURIComponent(email)}`);
    } catch (error) {
      handleAdminError(error);
      throw error;
    }
  },

  rejectWaitlistUser: async (email: string) => {
    try {
      return await api.delete(`/admin/waitlist/${encodeURIComponent(email)}`);
    } catch (error) {
      handleAdminError(error);
      throw error;
    }
  },

  approveUser: async (userId: string) => {
    try {
      const { data } = await api.post<User>(`/users/${userId}/approve`);
      return data;
    } catch (error) {
      handleAdminError(error);
      throw error;
    }
  },

  updateTier: async (userId: string, tier: 'free' | 'pro') => {
    try {
      const { data } = await api.patch<User>(`/admin/users/${userId}/tier`, {
        tier,
      });
      return data;
    } catch (error) {
      handleAdminError(error);
      throw error;
    }
  },

  giftCredits: async (userId: string, amount: number, reason: string) => {
    try {
      const { data } = await api.post<User>(`/admin/users/${userId}/credits`, {
        amount,
        reason,
      });
      return data;
    } catch (error) {
      handleAdminError(error);
      throw error;
    }
  },

  // Ticker Shadow Ban Management
  getHiddenTickers: async () => {
    try {
      const { data } = await api.get<{ id: string; symbol: string; name: string; exchange: string; is_hidden: boolean }[]>('/tickers/admin/hidden');
      return data;
    } catch (error) {
      handleAdminError(error);
      throw error;
    }
  },

  searchTickersAdmin: async (search?: string) => {
    try {
      const { data } = await api.get<{ id: string; symbol: string; name: string; exchange: string; is_hidden: boolean }[]>('/tickers/admin/search', { params: { search } });
      return data;
    } catch (error) {
      handleAdminError(error);
      throw error;
    }
  },

  setTickerHidden: async (symbol: string, hidden: boolean) => {
    try {
      const { data } = await api.patch(`/tickers/${symbol}/hidden`, { hidden });
      return data;
    } catch (error) {
      handleAdminError(error);
      throw error;
    }
  },
};
