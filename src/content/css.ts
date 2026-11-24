import type { ElementInfo } from '../shared/types';

const UNSAFE_VALUE =
  /[;{}<>\\@]|url\s*\(|expression\s*\(|javascript:|data:|[\u0000-\u001f\u007f]/i;

export function cssEscape(value: string): string {
  if (!value) return '';
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  const chars = Array.from(value);
  return chars
    .map((char, index) => {
      const leadingDigit =
        /[0-9]/.test(char) &&
        (index === 0 || (index === 1 && chars[0] === '-'));
      if (/[a-zA-Z0-9_-]/.test(char) && !leadingDigit) return char;
      return `\\${char.codePointAt(0)!.toString(16)} `;
    })
    .join('');
}

export function buildSelector(info: Pick<ElementInfo, 'tag' | 'id' | 'classes'>): string {
  const tag = info.tag.toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(tag)) return '*';
  if (info.id) return `#${cssEscape(info.id)}`;
  const classes = info.classes
    .filter((name) => name.length > 0)
    .slice(0, 4)
    .map(cssEscape);
  return classes.length > 0 ? `${tag}.${classes.join('.')}` : tag;
}

export function sanitizeCssValue(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 300 || UNSAFE_VALUE.test(trimmed)) return null;
  return trimmed.replace(/\s*!important\s*$/i, '').trim() || null;
}

export function serializeCss(info: ElementInfo): string {
  const declarations: Array<[string, string | null]> = [
    ['display', info.display],
    ['position', info.position],
    ['width', `${info.dimensions.width}px`],
    ['height', `${info.dimensions.height}px`],
    ['padding', info.padding],
    ['margin', info.margin],
    ['background-color', info.backgroundColor],
    ['color', info.color],
    ['font-family', info.fontFamily],
    ['font-size', info.fontSize],
    ['font-weight', info.fontWeight],
    ['border-radius', info.borderRadius],
    ['box-shadow', info.boxShadow],
  ];

  const lines = declarations.flatMap(([property, raw]) => {
    const value = sanitizeCssValue(raw);
    return value ? [`  ${property}: ${value};`] : [];
  });

  return `${buildSelector(info)} {\n${lines.join('\n')}\n}`;
}
