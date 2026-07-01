import * as vscode from 'vscode';
import { PiiEntityType, RedactMethod } from './piiTypes';

export const ALL_ENTITIES: PiiEntityType[] = ['EMAIL', 'PHONE', 'CREDIT_CARD', 'SSN', 'IP_ADDRESS', 'PERSON', 'LOCATION', 'DATE', 'URL', 'PASSPORT_US', 'DRIVERS_LICENSE_US'];

export function initializeTrial(_context: vscode.ExtensionContext) {}

export function isFeatureEnabled(_feature: string): boolean {
  return true;
}

export function filterEntitiesByTier(entities?: PiiEntityType[]): PiiEntityType[] {
  return entities ?? [];
}

export function filterRedactMethods(method: RedactMethod): RedactMethod {
  return method;
}
