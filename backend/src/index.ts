import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { loadConfig } from './config';
import { initDb } from './db/connection';
import { createSessionMiddleware } from './auth/session';
import { createAuthRouter } from './auth/authRoutes';
import { createDraftRouter } from './mail/draftRoutes';
import { createUploadRouter } from './uploads/uploadRoutes';
import { createCampaignRouter } from './campaigns/campaignRoutes';
import { createTrackingRouter } from './tracking/trackingRoutes';
import { setupSocketServer } from './sockets/socketServer';

const config = loadConfig();
initDb();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true, credentials: true } });

const sessionMiddleware = createSessionMiddleware(config);

app.use(express.json());
app.use(sessionMiddleware);

app.use('/api/auth', createAuthRouter(config));
app.use('/api/drafts', createDraftRouter(config));
app.use('/api/uploads', createUploadRouter(config));
app.use('/api/campaigns', createCampaignRouter(config, io));
app.use('/t', createTrackingRouter());

setupSocketServer(io, sessionMiddleware);

const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api|\/t).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

httpServer.listen(config.server.port, () => {
  console.log(`mail-sender backend listening on port ${config.server.port}`);
});
