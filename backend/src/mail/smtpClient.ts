import nodemailer, { Transporter } from 'nodemailer';
import type { AppConfig } from '../config';
import type { SessionCredentials } from '../types';

export function createSmtpTransport(config: AppConfig, creds: SessionCredentials): Transporter {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: creds.email, pass: creds.password },
  });
}
