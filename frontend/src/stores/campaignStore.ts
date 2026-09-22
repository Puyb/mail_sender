import { defineStore } from 'pinia';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import type { CampaignCompletedEvent, CampaignProgressEvent, CampaignSummary, Recipient, RecipientWarning } from '../types';

export const useCampaignStore = defineStore('campaign', {
  state: () => ({
    recipientsPreview: [] as Recipient[],
    warnings: [] as RecipientWarning[],
    campaigns: [] as CampaignSummary[],
    progress: null as CampaignProgressEvent | null,
    completed: null as CampaignCompletedEvent | null,
    subscribedCampaignId: null as string | null,
  }),
  actions: {
    async uploadFile(file: File): Promise<void> {
      const res = await api.uploadRecipients(file);
      this.recipientsPreview = res.recipients;
      this.warnings = res.warnings;
    },
    clearRecipients(): void {
      this.recipientsPreview = [];
      this.warnings = [];
    },
    async launchCampaign(draftUid: number): Promise<string> {
      const res = await api.createCampaign(draftUid, this.recipientsPreview);
      this.progress = null;
      this.completed = null;
      this.subscribeToCampaign(res.campaignId);
      return res.campaignId;
    },
    subscribeToCampaign(campaignId: string): void {
      const socket = getSocket();
      this.subscribedCampaignId = campaignId;
      socket.emit('campaign:subscribe', { campaignId });
      socket.off('campaign:progress');
      socket.off('campaign:completed');
      socket.on('campaign:progress', (payload: CampaignProgressEvent) => {
        if (payload.campaignId === this.subscribedCampaignId) this.progress = payload;
      });
      socket.on('campaign:completed', (payload: CampaignCompletedEvent) => {
        if (payload.campaignId === this.subscribedCampaignId) this.completed = payload;
      });
    },
    async loadHistory(): Promise<void> {
      const res = await api.listCampaigns();
      this.campaigns = res.campaigns;
    },
  },
});
