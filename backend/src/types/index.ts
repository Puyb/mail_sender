export interface Recipient {
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface RecipientParseWarning {
  line: number;
  reason: string;
  raw?: string;
}

export interface RecipientParseResult {
  recipients: Recipient[];
  warnings: RecipientParseWarning[];
}

export type CampaignStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type RecipientStatus = 'pending' | 'sent' | 'failed';

export interface CampaignRow {
  id: string;
  sender_email: string;
  subject: string;
  draft_uid: string | null;
  raw_mime: Buffer;
  status: CampaignStatus;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  send_rate_per_min: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  error_message: string | null;
}

export interface CampaignRecipientRow {
  id: number;
  campaign_id: string;
  tracking_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: RecipientStatus;
  error_reason: string | null;
  sent_at: string | null;
  sort_order: number;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
}

export interface CampaignLinkRow {
  id: number;
  campaign_id: string;
  original_url: string;
}

export interface TrackingEventRow {
  id: number;
  campaign_recipient_id: number;
  event_type: 'open' | 'click';
  link_id: number | null;
  occurred_at: string;
  user_agent: string | null;
  ip_address: string | null;
}

export interface SessionCredentials {
  email: string;
  password: string;
}

declare module 'express-session' {
  interface SessionData {
    email?: string;
  }
}
