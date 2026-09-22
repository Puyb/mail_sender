import { defineStore } from 'pinia';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import type {
  CampaignCompletedEvent,
  CampaignProgressEvent,
  CampaignRateChangedEvent,
  CampaignSummary,
  Recipient,
  RecipientWarning,
} from '../types';

export const useCampaignStore = defineStore('campaign', {
  state: () => ({
    recipientsPreview: [] as Recipient[],
    warnings: [] as RecipientWarning[],
    campaigns: [] as CampaignSummary[],
    progress: null as CampaignProgressEvent | null,
    completed: null as CampaignCompletedEvent | null,
    rateChanged: null as CampaignRateChangedEvent | null,
    subscribedCampaignId: null as string | null,
  }),
  actions: {
    async uploadFile(file: File): Promise<void> {
      const res = await api.uploadRecipients(file);
      const seen = new Set(this.recipientsPreview.map((r) => r.email.toLowerCase()));
      const merged = [...this.recipientsPreview];
      const extraWarnings: RecipientWarning[] = [];
      for (const r of res.recipients) {
        const email = r.email.toLowerCase();
        if (seen.has(email)) {
          extraWarnings.push({ line: 0, reason: 'Déjà présent dans la liste', raw: r.email });
          continue;
        }
        seen.add(email);
        merged.push(r);
      }
      this.recipientsPreview = merged;
      this.warnings = [...this.warnings, ...res.warnings, ...extraWarnings];
    },
    removeRecipient(email: string): void {
      this.recipientsPreview = this.recipientsPreview.filter((r) => r.email !== email);
    },
    clearRecipients(): void {
      this.recipientsPreview = [];
      this.warnings = [];
    },
    async launchCampaign(draftUid: number, sendRatePerMinute?: number): Promise<string> {
      const res = await api.createCampaign(draftUid, this.recipientsPreview, sendRatePerMinute);
      this.progress = null;
      this.completed = null;
      this.rateChanged = null;
      this.subscribeToCampaign(res.campaignId);
      return res.campaignId;
    },
    subscribeToCampaign(campaignId: string): void {
      const socket = getSocket();
      this.subscribedCampaignId = campaignId;
      socket.emit('campaign:subscribe', { campaignId });
      socket.off('campaign:progress');
      socket.off('campaign:completed');
      socket.off('campaign:rateChanged');
      socket.on('campaign:progress', (payload: CampaignProgressEvent) => {
        if (payload.campaignId === this.subscribedCampaignId) this.progress = payload;
      });
      socket.on('campaign:completed', (payload: CampaignCompletedEvent) => {
        if (payload.campaignId === this.subscribedCampaignId) this.completed = payload;
      });
      socket.on('campaign:rateChanged', (payload: CampaignRateChangedEvent) => {
        if (payload.campaignId === this.subscribedCampaignId) this.rateChanged = payload;
      });
    },
    async updateSendRate(campaignId: string, emailsPerMinute: number): Promise<void> {
      await api.updateSendRate(campaignId, emailsPerMinute);
    },
    async stopCampaign(campaignId: string): Promise<void> {
      await api.stopCampaign(campaignId);
    },
    async loadHistory(): Promise<void> {
      const res = await api.listCampaigns();
      this.campaigns = res.campaigns;
    },
  },
});
