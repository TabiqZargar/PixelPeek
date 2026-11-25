import { describe, expect, it } from 'vitest';
import {
  serializeDesignSystemCss,
  serializeDesignSystemJson,
  serializeDesignSystemPrompt,
} from '../src/content/design-system-export';
import { makeDesignSystemSnapshot } from './fixtures';

describe('design-system CSS export', () => {
  it('emits balanced custom properties with original sanitized values', () => {
    const css = serializeDesignSystemCss(makeDesignSystemSnapshot());
    expect(css).toContain('--accent-purple: rgb(139, 109, 255);');
    expect(css).toContain(':root {');
    expect((css.match(/\{/g) ?? []).length).toBe((css.match(/\}/g) ?? []).length);
    expect(css).not.toContain('display: none');
  });

  it('drops invalid names and unsafe values', () => {
    const snapshot = makeDesignSystemSnapshot();
    const token = snapshot.tokens[0]!;
    const css = serializeDesignSystemCss(makeDesignSystemSnapshot({
      tokens: [{
        ...token,
        inferredName: '--Not Valid; }',
        detected: {
          ...token.detected,
          values: [{ ...token.detected.values[0]!, value: 'url(https://tracker.example/x)' }],
        },
      }],
    }));

    expect(css).not.toContain('--Not Valid');
    expect(css).not.toContain('tracker.example');
    expect(css).not.toContain('url(');
    expect(css).toContain(':root {');
  });

  it('stays valid and bounded at small payload limits', () => {
    const css = serializeDesignSystemCss(makeDesignSystemSnapshot(), 30);
    expect(css.length).toBeLessThanOrEqual(30);
    expect(css).toContain(':root');
    expect((css.match(/\{/g) ?? []).length).toBe((css.match(/\}/g) ?? []).length);
    expect(serializeDesignSystemCss(makeDesignSystemSnapshot(), 5).length).toBeLessThanOrEqual(5);
  });
});

describe('design-system JSON export', () => {
  it('round-trips detected values with inferred-name metadata', () => {
    const json = serializeDesignSystemJson(makeDesignSystemSnapshot());
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe('pixelpeek.design-system/v1');
    expect(parsed.inferredNames).toBe(true);
    expect(parsed.detected.palette[1].value).toBe('rgb(255, 97, 97)');
    expect(parsed.tokens[0].name).toBe('--accent-purple');
    expect(parsed.tokens[0].inferred).toBe(true);
    expect(parsed.tokens[0].values).toEqual(['rgb(139, 109, 255)']);
  });

  it('omits unsafe token names and values', () => {
    const snapshot = makeDesignSystemSnapshot();
    const token = snapshot.tokens[0]!;
    const parsed = JSON.parse(serializeDesignSystemJson(makeDesignSystemSnapshot({
      tokens: [{
        ...token,
        inferredName: '--Bad Name',
        detected: {
          ...token.detected,
          values: [{ ...token.detected.values[0]!, value: 'expression(alert(1))' }],
        },
      }],
    })));
    expect(parsed.tokens).toEqual([]);
  });

  it('always produces parseable JSON under a payload limit', () => {
    const json = serializeDesignSystemJson(makeDesignSystemSnapshot(), 40);
    expect(json.length).toBeLessThanOrEqual(40);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe('design-system prompt export', () => {
  it('summarizes detected values and marks names as inferences', () => {
    const prompt = serializeDesignSystemPrompt(makeDesignSystemSnapshot());
    expect(prompt).toContain('PixelPeek design system summary');
    expect(prompt).toContain('not authored names');
    expect(prompt).toContain('Detected values:');
    expect(prompt).toContain('--accent-purple: rgb(139, 109, 255) (2 uses, heuristic)');
  });

  it('does not include page text, full URLs, titles or arbitrary notes', () => {
    const snapshot = makeDesignSystemSnapshot({
      origin: 'https://example.com/private/page?token=secret',
      limitations: ['user@example.com wrote this note'],
      unavailable: ['secret internal stylesheet'],
    });
    const prompt = serializeDesignSystemPrompt(snapshot);
    expect(prompt).toContain('Origin: https://example.com');
    expect(prompt).not.toContain('/private/page');
    expect(prompt).not.toContain('secret');
    expect(prompt).not.toContain('user@example.com');
  });

  it('truncates deterministically within the payload limit', () => {
    const prompt = serializeDesignSystemPrompt(makeDesignSystemSnapshot(), 80);
    expect(prompt.length).toBeLessThanOrEqual(80);
    expect(serializeDesignSystemPrompt(makeDesignSystemSnapshot(), 80)).toBe(prompt);
    expect(serializeDesignSystemPrompt(makeDesignSystemSnapshot(), 5).length).toBeLessThanOrEqual(5);
  });
});
