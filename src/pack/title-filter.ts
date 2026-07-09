const SKIP_PATTERN = /\{\[[0-9a-f]{4}\]\}|\uDB40[\uDD00-\uDD0F]|[⿰⿸⿺]/;

export function isSkippedTitle(title: string): boolean {
  return SKIP_PATTERN.test(title);
}

export class FileTitleAcceptor {
  private seen = new Set<string>();

  acceptFileTitle(fileTitle: string): boolean {
    if (/[⿰⿸⿺]/.test(fileTitle)) return false;
    const normalized = fileTitle.normalize('NFD');
    if (this.seen.has(normalized)) return false;
    this.seen.add(normalized);
    return true;
  }
}
