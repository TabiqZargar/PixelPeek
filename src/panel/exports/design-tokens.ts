import { serializeDesignSystemCss } from '../../content/design-system-export';
import { isWebsiteBlueprint } from '../../shared/messages';
import type { WebsiteBlueprint } from '../../shared/types';
import { EXPORT_FORMATS, EXPORT_LIMITS, type ExportOptions, type ExportResult } from './types';

const DEFAULT_DESIGN_SYSTEM_LIMIT = 20000;

function assertValidBlueprint(value: unknown): WebsiteBlueprint {
  if (!isWebsiteBlueprint(value)) throw new TypeError('Invalid WebsiteBlueprint.');
  return value;
}

function normalizeMaxChars(options: ExportOptions | undefined): number {
  const max = options?.maxChars ?? EXPORT_LIMITS.maxOutputChars;
  if (!Number.isInteger(max) || max < 1 || max > EXPORT_LIMITS.maxOutputChars) {
    throw new RangeError(`Export limit must be between 1 and ${EXPORT_LIMITS.maxOutputChars} characters.`);
  }
  return max;
}

function boundedWarnings(values: readonly string[]): string[] {
  const unique = Array.from(new Set(values.filter((value) => value.length > 0)));
  if (unique.length <= EXPORT_LIMITS.maxWarnings) return unique;
  const kept = unique.slice(0, EXPORT_LIMITS.maxWarnings - 1);
  kept.push(`Additional warnings were omitted because the warning limit of ${EXPORT_LIMITS.maxWarnings} was reached.`);
  return kept;
}

export function serializeDesignTokensCss(blueprint: unknown, options?: ExportOptions): ExportResult {
  const valid = assertValidBlueprint(blueprint);
  const maxChars = normalizeMaxChars(options);
  const content = serializeDesignSystemCss(valid.designSystem, Number.MAX_SAFE_INTEGER);
  if (content.length > maxChars) {
    throw new RangeError(`Design Tokens CSS output exceeds the ${maxChars}-character export limit.`);
  }

  const warnings: string[] = ['Token names are inferred suggestions; verify them against the source.'];
  if (serializeDesignSystemCss(valid.designSystem, DEFAULT_DESIGN_SYSTEM_LIMIT) !== content) {
    warnings.push('The full token set is larger than the default design-system CSS limit.');
  }
  if (valid.metadata.status !== 'complete') {
    warnings.push(`Blueprint status: ${valid.metadata.status}.`);
  }
  if (valid.metadata.truncation.truncated) {
    warnings.push(
      'Blueprint was truncated. ' +
      `Reasons: ${valid.metadata.truncation.reasons.join(', ') || 'none reported'}. ` +
      `Limits reached: ${valid.metadata.truncation.limitsReached.join(', ') || 'none reported'}.`,
    );
  }
  for (const note of valid.designSystem.unavailable) {
    warnings.push(`Unavailable design token data: ${note}`);
  }
  for (const note of valid.designSystem.limitations) {
    warnings.push(`Design token limitation: ${note}`);
  }

  const format = EXPORT_FORMATS['design-tokens-css'];
  return {
    id: 'design-tokens-css',
    filename: format.filename,
    mimeType: format.mimeType,
    content,
    charCount: content.length,
    warnings: boundedWarnings(warnings),
  };
}
