import { sha256 } from './tooling.js';

export interface CommentIdentity { repository: string; workflow: string; job: string; report: string }
export interface ReportOrder { runNumber: number; attempt: number }
export interface Comment { id: number; authorId: number; body: string }

export function commentMarker(identity: CommentIdentity): string {
  return `<!-- evals-action:${sha256(JSON.stringify(identity))} -->`;
}

export function orderedBody(identity: CommentIdentity, order: ReportOrder, markdown: string): string {
  for (const value of [order.runNumber, order.attempt]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid report order.');
  }
  return `${commentMarker(identity)}\n<!-- order:${order.runNumber}:${order.attempt} -->\n${markdown}`;
}

export function selectComment(
  comments: readonly Comment[], identity: CommentIdentity, order: ReportOrder, authenticatedAuthorId: number,
): { action: 'create' } | { action: 'update'; id: number } | { action: 'stale' } {
  // Validate first even when there is no existing comment.
  orderedBody(identity, order, '');
  const owned = comments.filter((comment) => comment.authorId === authenticatedAuthorId && comment.body.startsWith(`${commentMarker(identity)}\n`));
  if (owned.length > 1) throw new Error('Duplicate Action-owned report comments require reconciliation.');
  const existing = owned[0];
  if (!existing) return { action: 'create' };
  const match = /^<!-- order:(\d+):(\d+) -->$/m.exec(existing.body);
  if (!match) throw new Error('Action-owned comment has no valid ordering metadata.');
  const previous = { runNumber: Number(match[1]), attempt: Number(match[2]) };
  orderedBody(identity, previous, '');
  if (previous.runNumber > order.runNumber || (previous.runNumber === order.runNumber && previous.attempt > order.attempt)) return { action: 'stale' };
  return { action: 'update', id: existing.id };
}
