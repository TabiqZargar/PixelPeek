interface SelectionSnapshot {
  range: Range;
}

function captureSelection(): SelectionSnapshot | null {
  try {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    return { range: selection.getRangeAt(0).cloneRange() };
  } catch {
    return null;
  }
}

function restoreSelection(snapshot: SelectionSnapshot | null): void {
  if (!snapshot) return;
  try {
    const selection = document.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(snapshot.range);
  } catch {}
}

function restoreFocus(target: HTMLElement | null): void {
  if (!target) return;
  try {
    if (document.contains(target)) target.focus({ preventScroll: true });
  } catch {
    try {
      if (document.contains(target)) target.focus();
    } catch {}
  }
}

export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  const focusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = captureSelection();
  let area: HTMLTextAreaElement | null = null;
  try {
    area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area?.remove();
    restoreFocus(focusTarget);
    restoreSelection(selection);
  }
}
