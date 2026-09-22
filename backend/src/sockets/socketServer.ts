import type { Server, Socket } from 'socket.io';
import type { RequestHandler, Request } from 'express';
import type { Session, SessionData } from 'express-session';
import { getCampaignById } from '../db/repositories/campaignRepository';

type SessionRequest = Request & { session: Session & Partial<SessionData> };

export function setupSocketServer(io: Server, sessionMiddleware: RequestHandler): void {
  io.engine.use(sessionMiddleware);

  io.on('connection', (socket: Socket) => {
    socket.on('campaign:subscribe', (payload: { campaignId?: string }) => {
      const campaignId = payload?.campaignId;
      if (!campaignId) return;
      const req = socket.request as SessionRequest;
      const email = req.session?.email;
      const campaign = getCampaignById(campaignId);
      if (!email || !campaign || campaign.sender_email !== email) return;
      socket.join(`campaign:${campaignId}`);
    });
  });
}
