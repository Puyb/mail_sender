export interface Recipient {
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface RecipientWarning {
  line: number;
  reason: string;
  raw?: string;
}

export interface DraftSummary {
  uid: number;
  subject: string;
  date: string | null;
}

export interface DraftContent {
  uid: number;
  subject: string;
  html: string | null;
  text: string | null;
  attachmentCount: number;
}

export type CampaignStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TrackingSummary {
  uniqueOpens: number;
  totalOpens: number;
  uniqueClicks: number;
  totalClicks: number;
}

export interface CampaignSummary {
  id: string;
  sender_email: string;
  subject: string;
  status: CampaignStatus;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  send_rate_per_min: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  error_message: string | null;
  tracking: TrackingSummary;
}

export interface CampaignRecipient {
  id: number;
  campaign_id: string;
  tracking_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: 'pending' | 'sent' | 'failed';
  error_reason: string | null;
  sent_at: string | null;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
}

export interface LinkStat {
  linkId: number;
  originalUrl: string;
  totalClicks: number;
  uniqueClicks: number;
}

export interface CampaignDetail {
  campaign: CampaignSummary;
  recipients: CampaignRecipient[];
  tracking: TrackingSummary;
  links: LinkStat[];
}

export interface CampaignProgressEvent {
  campaignId: string;
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
  currentRecipientEmail: string;
}

export interface CampaignCompletedEvent {
  campaignId: string;
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
  durationMs: number;
}
