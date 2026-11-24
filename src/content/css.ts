import type { Edges, ElementInfo, ElementSnapshot } from '../shared/types';

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

function serializeDeclarations(declarations: Array<[string, string | null]>): string[] {
  return declarations.flatMap(([property, raw]) => {
    const value = sanitizeCssValue(raw);
    return value ? [`  ${property}: ${value};`] : [];
  });
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

  return `${buildSelector(info)} {\n${serializeDeclarations(declarations).join('\n')}\n}`;
}

function edgeShorthand(edges: Edges): string | null {
  const values = [edges.top, edges.right, edges.bottom, edges.left];
  if (values.some((value) => value === null)) return null;
  if (values.every((value) => value === '0px')) return '0';
  const [top, right, bottom, left] = values as string[];
  const first = top ?? null;
  const second = right ?? null;
  const third = bottom ?? null;
  const fourth = left ?? null;
  if (first === null || second === null || third === null || fourth === null) return null;
  if (second === fourth && first === third) return first;
  if (second === fourth) return `${first} ${second}`;
  return `${first} ${second} ${third} ${fourth}`;
}

function propertyValue(snapshot: ElementSnapshot, name: string): string | null {
  return snapshot.properties.find((property) => property.name === name)?.value ?? null;
}

export function suggestSelectors(snapshot: ElementSnapshot): string[] {
  const { element } = snapshot;
  const suggestions = [buildSelector(element)];
  const tag = /^[a-z][a-z0-9-]*$/.test(element.tag.toLowerCase()) ? element.tag.toLowerCase() : '*';
  const classes = element.classes.filter(Boolean).slice(0, 3).map(cssEscape);
  if (element.id) suggestions.push(`#${cssEscape(element.id)}`);
  if (classes.length) {
    suggestions.push(`${tag}.${classes.join('.')}`);
    suggestions.push(`.${classes[0]}`);
  }
  suggestions.push(tag);
  return Array.from(new Set(suggestions.filter(Boolean))).slice(0, 4);
}

export function serializeSnapshotCss(snapshot: ElementSnapshot): string {
  const { element, boxModel, typography } = snapshot;
  const declarations = serializeDeclarations([
    ['display', element.display],
    ['position', element.position],
    ['width', `${element.dimensions.width}px`],
    ['height', `${element.dimensions.height}px`],
    ['box-sizing', boxModel.boxSizing],
    ['margin', edgeShorthand(boxModel.margin)],
    ['padding', edgeShorthand(boxModel.padding)],
    ['border-width', propertyValue(snapshot, 'border-top-width')],
    ['border-style', propertyValue(snapshot, 'border-top-style')],
    ['border-color', propertyValue(snapshot, 'border-top-color')],
    ['border-radius', element.borderRadius],
    ['overflow', propertyValue(snapshot, 'overflow')],
    ['gap', propertyValue(snapshot, 'gap')],
    ['flex-direction', propertyValue(snapshot, 'flex-direction')],
    ['align-items', propertyValue(snapshot, 'align-items')],
    ['justify-content', propertyValue(snapshot, 'justify-content')],
    ['grid-template-columns', propertyValue(snapshot, 'grid-template-columns')],
    ['color', typography.color.value],
    ['font-family', typography.fontFamily.value],
    ['font-size', typography.fontSize.value],
    ['font-weight', typography.fontWeight.value],
    ['font-style', typography.fontStyle.value],
    ['line-height', typography.lineHeight.value],
    ['letter-spacing', typography.letterSpacing.value],
    ['text-align', typography.textAlign.value],
    ['text-transform', typography.textTransform.value],
    ['text-decoration', typography.textDecoration.value],
    ['background-color', propertyValue(snapshot, 'background-color')],
    ['box-shadow', propertyValue(snapshot, 'box-shadow')],
    ['opacity', propertyValue(snapshot, 'opacity')],
  ]);

  for (const gradient of snapshot.gradients) {
    const value = sanitizeCssValue(gradient.raw);
    if (value) declarations.push(`  ${gradient.property}: ${value};`);
  }

  return `${suggestSelectors(snapshot)[0] ?? '*'} {\n${declarations.join('\n')}\n}`;
}
