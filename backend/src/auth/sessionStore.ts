import type { SessionCredentials } from '../types';

const credentialsBySessionId = new Map<string, SessionCredentials>();

export function setCredentials(sessionId: string, creds: SessionCredentials): void {
  credentialsBySessionId.set(sessionId, creds);
}

export function getCredentials(sessionId: string): SessionCredentials | undefined {
  return credentialsBySessionId.get(sessionId);
}

export function clearCredentials(sessionId: string): void {
  credentialsBySessionId.delete(sessionId);
}
