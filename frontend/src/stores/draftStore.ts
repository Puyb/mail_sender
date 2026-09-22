import { defineStore } from 'pinia';
import { api } from '../services/api';
import type { DraftContent, DraftSummary } from '../types';

export const useDraftStore = defineStore('draft', {
  state: () => ({
    drafts: [] as DraftSummary[],
    selected: null as DraftContent | null,
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async loadDrafts(): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.listDrafts();
        this.drafts = res.drafts;
      } catch (err) {
        this.error = (err as Error).message;
      } finally {
        this.loading = false;
      }
    },
    async selectDraft(uid: number): Promise<void> {
      this.error = null;
      this.selected = await api.getDraft(uid);
    },
  },
});
