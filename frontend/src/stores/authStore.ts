import { defineStore } from 'pinia';
import { api } from '../services/api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    email: null as string | null,
    isAuthenticated: false,
    loading: true,
  }),
  actions: {
    async fetchMe(): Promise<void> {
      try {
        const res = await api.me();
        this.email = res.email;
        this.isAuthenticated = true;
      } catch {
        this.email = null;
        this.isAuthenticated = false;
      } finally {
        this.loading = false;
      }
    },
    async login(email: string, password: string): Promise<void> {
      const res = await api.login(email, password);
      this.email = res.email;
      this.isAuthenticated = true;
    },
    async logout(): Promise<void> {
      await api.logout();
      this.email = null;
      this.isAuthenticated = false;
    },
  },
});
