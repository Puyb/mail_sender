import type { CampaignDetail, DraftContent, DraftSummary, Recipient, RecipientWarning, CampaignSummary } from '../types';

const BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ email: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ email: string }>('/auth/me'),

  listDrafts: () => request<{ drafts: DraftSummary[] }>('/drafts'),
  getDraft: (uid: number) => request<DraftContent>(`/drafts/${uid}`),

  uploadRecipients: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(BASE + '/uploads/recipients', { method: 'POST', credentials: 'include', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Erreur lors du téléversement du fichier');
    }
    return res.json() as Promise<{ recipients: Recipient[]; count: number; warnings: RecipientWarning[] }>;
  },

  createCampaign: (draftUid: number, recipients: Recipient[], sendRatePerMinute?: number) =>
    request<{ campaignId: string }>('/campaigns', {
      method: 'POST',
      body: JSON.stringify({ draftUid, recipients, sendRatePerMinute }),
    }),
  listCampaigns: () => request<{ campaigns: CampaignSummary[] }>('/campaigns'),
  getCampaign: (id: string) => request<CampaignDetail>(`/campaigns/${id}`),
  getDefaultSendRate: () => request<{ emailsPerMinute: number }>('/campaigns/defaults'),
  updateSendRate: (id: string, emailsPerMinute: number) =>
    request<{ ok: boolean }>(`/campaigns/${id}/send-rate`, {
      method: 'PATCH',
      body: JSON.stringify({ emailsPerMinute }),
    }),
  stopCampaign: (id: string) => request<{ ok: boolean }>(`/campaigns/${id}/stop`, { method: 'POST' }),
};
