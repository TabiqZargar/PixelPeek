export function downloadText(filename: string, mimeType: string, content: string): boolean {
  let objectUrl: string | undefined;
  let anchor: HTMLAnchorElement | undefined;

  try {
    const blob = new Blob([content], { type: mimeType });
    objectUrl = URL.createObjectURL(blob);
    anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    return true;
  } catch {
    return false;
  } finally {
    anchor?.remove();
    if (objectUrl) {
      const url = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}
