import * as vscode from 'vscode';
import { PiiEntityType, RedactMethod } from './piiTypes';

export type Feature =
  | 'advanced-entities'
  | 'hash-redaction'
  | 'inline-warnings'
  | 'chat-participant';

export type Tier = 'free' | 'pro';

const FEATURE_TIER: Record<Feature, Tier> = {
  'advanced-entities': 'pro',
  'hash-redaction': 'pro',
  'inline-warnings': 'pro',
  'chat-participant': 'pro',
};

const PRO_ENTITIES: PiiEntityType[] = ['PERSON', 'LOCATION', 'DATE'];
export const FREE_ENTITIES: PiiEntityType[] = ['EMAIL', 'PHONE', 'CREDIT_CARD', 'SSN', 'IP_ADDRESS', 'URL'];

export function getTier(): Tier {
  const licenseKey = vscode.workspace.getConfiguration('piiGuardian').get<string>('licenseKey', '');
  if (licenseKey && validateLicenseKey(licenseKey)) {
    return 'pro';
  }
  return 'free';
}

export function isFeatureEnabled(feature: Feature): boolean {
  return getTier() === 'pro';
}

export function filterEntitiesByTier(entities?: PiiEntityType[]): PiiEntityType[] {
  if (!entities) return [];
  if (getTier() === 'pro') return entities;
  return entities.filter(e => FREE_ENTITIES.includes(e));
}

export function filterRedactMethods(method: RedactMethod): RedactMethod {
  if (method === 'hash' && getTier() !== 'pro') {
    return 'placeholder';
  }
  return method;
}

function validateLicenseKey(key: string): boolean {
  if (!key || key.length < 10) return false;

  const pattern = /^PIIG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (!pattern.test(key)) return false;

  const parts = key.split('-');
  const data = parts[1] + parts[2] + parts[3];
  let checksum = 0;
  for (let i = 0; i < data.length; i++) {
    checksum += data.charCodeAt(i);
  }
  return checksum % 11 === 3;
}
