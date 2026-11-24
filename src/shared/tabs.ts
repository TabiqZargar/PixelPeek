export function isInspectableUrl(url: string | undefined): boolean {
  if (!url) return false;
  const normalized = url.trim().toLowerCase();
  if (!/^https?:\/\//.test(normalized)) return false;
  try {
    const parsed = new URL(normalized);
    return (
      parsed.hostname.length > 0 && (parsed.protocol === 'http:' || parsed.protocol === 'https:')
    );
  } catch {
    return false;
  }
}

export function describeMessageError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
