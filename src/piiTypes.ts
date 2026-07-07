export type PiiEntityType =
  | 'EMAIL'
  | 'PHONE'
  | 'CREDIT_CARD'
  | 'SSN'
  | 'IP_ADDRESS'
  | 'PERSON'
  | 'LOCATION'
  | 'DATE'
  | 'URL'
  | 'PASSPORT_US'
  | 'DRIVERS_LICENSE_US'
  | 'SECRET_KEY'
  | 'API_KEY'
  | 'JWT'
  | 'PEM_KEY'
  | 'CONNECTION_STRING';

export type RedactMethod = 'placeholder' | 'mask' | 'hash';

export interface PiiEntity {
  type: PiiEntityType;
  text: string;
  start: number;
  end: number;
  score: number;
}

export interface PiiResult {
  entities: PiiEntity[];
  anonymizedText: string;
  mapping: Map<string, string>;
}

export interface AnalyzerPattern {
  type: PiiEntityType;
  regex: RegExp;
  score: number;
  description: string;
}

export interface PiiOptions {
  entities?: PiiEntityType[];
  redactWith?: RedactMethod;
  enableDeAnonymization?: boolean;
  pythonPresidioPath?: string;
}
