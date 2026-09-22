import session from 'express-session';
import type { AppConfig } from '../config';

export function createSessionMiddleware(config: AppConfig) {
  return session({
    secret: config.server.sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: 'mailsender.sid',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: config.server.sessionMaxAgeMs,
    },
  });
}
