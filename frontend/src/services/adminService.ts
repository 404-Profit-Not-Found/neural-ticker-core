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

export const AdminService = {
  getUsers: async () => {
    const { data } = await api.get<User[]>('/admin/users');
    return data;
  },

  getUserlist: async () => {
    const { data } = await api.get<AllowedUser[]>('/admin/userlist');
    return data;
  },

  getIdentities: async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await api.get<any[]>('/admin/identities');
    return data;
  },

  addToUserlist: async (email: string) => {
    const { data } = await api.post<AllowedUser>('/admin/userlist', { email });
    return data;
  },

  revokeAccess: async (email: string) => {
    return api.delete(`/admin/userlist/${encodeURIComponent(email)}`);
  },

  rejectWaitlistUser: async (email: string) => {
    return api.delete(`/admin/waitlist/${encodeURIComponent(email)}`);
  },

  approveUser: async (userId: string) => {
    const { data } = await api.post<User>(`/users/${userId}/approve`);
    return data;
  },
};
