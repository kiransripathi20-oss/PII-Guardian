import { filterEntitiesByTier, filterRedactMethods } from './license';
import { AnalyzerPattern, PiiEntity, PiiEntityType, PiiResult, RedactMethod } from './piiTypes';

const BUILT_IN_PATTERNS: AnalyzerPattern[] = [
  {
    type: 'EMAIL',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    score: 0.95,
    description: 'Email address',
  },
  {
    type: 'PHONE',
    regex: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    score: 0.9,
    description: 'Phone number',
  },
  {
    type: 'CREDIT_CARD',
    regex: /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
    score: 0.95,
    description: 'Credit card number',
  },
  {
    type: 'SSN',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    score: 0.98,
    description: 'Social Security Number',
  },
  {
    type: 'IP_ADDRESS',
    regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    score: 0.85,
    description: 'IP address',
  },
  {
    type: 'URL',
    regex: /\bhttps?:\/\/[^\s<>"']+/g,
    score: 0.9,
    description: 'URL',
  },
  {
    type: 'PERSON',
    regex: /\b(?:[A-Z][a-z]+)\s(?:[A-Z][a-z]+)\b/g,
    score: 0.4,
    description: 'Person name (potential)',
  },
  {
    type: 'DATE',
    regex: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    score: 0.7,
    description: 'Date',
  },
  {
    type: 'LOCATION',
    regex: /\b(?:New York|Los Angeles|Chicago|Houston|Phoenix|Philadelphia|San Antonio|San Diego|Dallas|San Jose|Austin|Jacksonville|Fort Worth|Columbus|Charlotte|Indianapolis|San Francisco|Seattle|Denver|Nashville|Oklahoma City|El Paso|Washington|Boston|Las Vegas|Portland|Memphis|Louisville|Baltimore|Milwaukee|Albuquerque|Tucson|Fresno|Sacramento|Mesa|Kansas City|Atlanta|Omaha|Colorado Springs|Raleigh|Long Beach|Virginia Beach|Miami|Oakland|Minneapolis|Tampa|Tulsa|Arlington|New Orleans|Cleveland|Bakersfield|Honolulu|Anaheim|Stockton|Corpus Christi|Lexington|Henderson|St\. Paul|St\. Louis|Cincinnati|Pittsburgh|Greensboro|Anchorage|Plano|Lincoln|Orlando|Irvine|Newark|Durham|Chula Vista|Toledo|Fort Wayne|St\. Petersburg|Laredo|Jersey City|Chandler|Madison|Reno|Buffalo|Hialeah|Lubbock)\b/g,
    score: 0.3,
    description: 'US city name',
  },
  {
    type: 'PASSPORT_US',
    regex: /\b[A-Z]\d{8}\b/g,
    score: 0.7,
    description: 'US passport number',
  },
  {
    type: 'PASSPORT_US',
    regex: /\b\d{9}\b/g,
    score: 0.5,
    description: 'US passport number (9-digit format)',
  },
  {
    type: 'DRIVERS_LICENSE_US',
    regex: /\b(?:[A-Z]\d{7}|\d{8})\b/g,
    score: 0.5,
    description: 'US driver\'s license number',
  },
  {
    type: 'DRIVERS_LICENSE_US',
    regex: /\b[A-Z]\d{3}[-.\s]\d{4}[-.\s]\d{4}\b/g,
    score: 0.6,
    description: 'US driver\'s license number (hyphenated)',
  },
];

const ALWAYS_DETECT: PiiEntityType[] = ['PASSPORT_US', 'DRIVERS_LICENSE_US'];

const CONTEXT_REQUIRED: Partial<Record<PiiEntityType, string[]>> = {
  PASSPORT_US: ['passport', 'travel document'],
  DRIVERS_LICENSE_US: ['driver', 'drivers', "driver's", "driver\u2019s", ' dl ', ' d.l.', 'license', 'lic', 'identification'],
};

function hasContextHint(text: string, index: number, value: string, keywords: string[]): boolean {
  const windowLen = 60;
  const before = text.substring(Math.max(0, index - windowLen), index).toLowerCase().replace(/\u2019/g, "'");
  const after = text.substring(index + value.length, Math.min(text.length, index + value.length + windowLen)).toLowerCase().replace(/\u2019/g, "'");
  return keywords.some(kw => before.includes(kw) || after.includes(kw));
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

export function analyzePii(
  text: string,
  enabledEntities?: PiiEntityType[]
): PiiEntity[] {
  const entities: PiiEntity[] = [];
  const seen = new Set<string>();

  const patterns = enabledEntities && enabledEntities.length > 0
    ? BUILT_IN_PATTERNS.filter(p => enabledEntities.includes(p.type) || ALWAYS_DETECT.includes(p.type))
    : BUILT_IN_PATTERNS;

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.regex.source, 'g');
    while ((match = regex.exec(text)) !== null) {
      const key = `${match.index}-${match[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (isLikelyCode(match[0], text, match.index)) continue;

      const contextKeywords = CONTEXT_REQUIRED[pattern.type];
      if (contextKeywords && !hasContextHint(text, match.index, match[0], contextKeywords)) continue;

      entities.push({
        type: pattern.type,
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
        score: pattern.score,
      });
    }
  }

  entities.sort((a, b) => a.start - b.start);
  return mergeOverlapping(entities);
}

function isLikelyCode(value: string, fullText: string, index: number): boolean {
  const lineStart = fullText.lastIndexOf('\n', index) + 1;
  const line = fullText.substring(lineStart, fullText.indexOf('\n', index) >= 0 ? fullText.indexOf('\n', index) : fullText.length).trim();

  const codeIndicators = ['=', '=>', '===', '!==', '==', 'function', 'const', 'let', 'var', 'import', 'export', 'return', 'if', 'else', 'for', 'while', 'class'];
  if (codeIndicators.some(ind => line.startsWith(ind) || line.includes(' ' + ind + ' ') || line.includes(ind + ' '))) {
    const codePatterns = [/['"`][^'"`]*\d{3}-\d{2}-\d{4}[^'"`]*['"`]/, /\bconst\s+\w+\s*=/, /\blet\s+\w+\s*=/, /\bvar\s+\w+\s*=/];
    if (codePatterns.some(p => p.test(line))) return true;
  }

  const isAssignmentValue = fullText.substring(Math.max(0, index - 20), index).includes('=');
  const isStringLiteral = fullText.substring(Math.max(0, index - 1), index) === '"' || fullText.substring(Math.max(0, index - 1), index) === "'";
  if (isAssignmentValue || isStringLiteral) {
    const hasCodeContext = codeIndicators.some(ind => line.startsWith(ind) || line.includes(' ' + ind + ' ') || line.includes(ind + ' '));
    if (isAssignmentValue || hasCodeContext) {
      const codeLike = /['"`]\s*[=:]\s*['"`]/.test(fullText.substring(Math.max(0, index - 30), Math.min(fullText.length, index + value.length + 5)));
      if (codeLike) return true;
    }
  }

  return false;
}

function mergeOverlapping(entities: PiiEntity[]): PiiEntity[] {
  if (entities.length <= 1) return entities;

  const merged: PiiEntity[] = [entities[0]];

  for (let i = 1; i < entities.length; i++) {
    const last = merged[merged.length - 1];
    const current = entities[i];

    if (current.start < last.end) {
      if (current.end > last.end) {
        last.end = current.end;
        last.text = last.text + current.text;
      }
      if (current.score > last.score) {
        last.type = current.type;
        last.score = current.score;
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
}

function getPlaceholder(type: PiiEntityType, index: number, method: RedactMethod, text: string): string {
  switch (method) {
    case 'placeholder':
      return `<${type}_${index}>`;
    case 'mask':
      if (type === 'EMAIL') {
        const [local, domain] = text.split('@');
        return `${local[0]}***@${domain}`;
      }
      if (type === 'PHONE') {
        return `***-***-${text.slice(-4)}`;
      }
      if (type === 'CREDIT_CARD') {
        return `****-****-****-${text.slice(-4)}`;
      }
      return '*'.repeat(text.length);
    case 'hash':
      return `[${type}_${hashString(text)}]`;
    default:
      return `<${type}_${index}>`;
  }
}

export function anonymizeText(
  text: string,
  options: { entities?: PiiEntityType[]; redactWith?: RedactMethod } = {}
): PiiResult {
  const redactWith = filterRedactMethods(options.redactWith || 'placeholder');
  const entities = analyzePii(text, filterEntitiesByTier(options.entities));

  const mapping = new Map<string, string>();
  const placeholderCounts = new Map<PiiEntityType, number>();

  let result = '';
  let lastIndex = 0;

  for (const entity of entities) {
    result += text.substring(lastIndex, entity.start);

    const count = (placeholderCounts.get(entity.type) || 0) + 1;
    placeholderCounts.set(entity.type, count);
    const placeholder = getPlaceholder(entity.type, count, redactWith, entity.text);

    mapping.set(placeholder, entity.text);
    result += placeholder;
    lastIndex = entity.end;
  }

  result += text.substring(lastIndex);

  return { entities, anonymizedText: result, mapping };
}

export function deanonymizeText(anonymizedText: string, mapping: Map<string, string>): string {
  let result = anonymizedText;
  for (const [placeholder, original] of mapping) {
    result = result.split(placeholder).join(original);
  }
  return result;
}
