import { createHash, randomUUID } from 'node:crypto';
import { Parser } from 'htmlparser2';
import { ResearchTaskSchema, SourceInspectionSchema, type SourceInspection } from '@bagos/contracts/research';
import { readPublicSource, SourceReadError, type SourceNetwork, type SourceGapCode } from './public-source.js';

export type SourceSnapshot = { receipt: SourceInspection; text: string };
export type SourceObservation =
  | { status: 'inspected'; snapshot: SourceSnapshot; gaps: string[] }
  | { status: 'uninspected'; sourceUrl: string; code: SourceGapCode; gaps: string[] };

const ignoredTags = new Set(['head', 'script', 'style', 'template', 'noscript', 'svg', 'canvas', 'iframe', 'object']);
const MAX_TEXT_CHARACTERS = 16000;

function htmlText(html: string): string {
  const fragments: string[] = [];
  let ignoredDepth = 0;
  const parser = new Parser({
    onopentag(name) {
      if (ignoredDepth || ignoredTags.has(name)) ignoredDepth += 1;
      else fragments.push(' ');
    },
    ontext(text) { if (!ignoredDepth) fragments.push(text); },
    onclosetag() {
      if (ignoredDepth) ignoredDepth -= 1;
      else fragments.push(' ');
    },
  }, { decodeEntities: true });
  parser.end(html);
  return fragments.join('').replace(/\s+/g, ' ').trim();
}

function excerpt(raw: { kind: 'html' | 'plain'; text: string }) {
  const text = raw.kind === 'html' ? htmlText(raw.text) : raw.text.trim();
  if (!text) throw new SourceReadError('empty_content');
  // Avoid cutting a UTF-16 surrogate pair at the excerpt boundary.
  let end = Math.min(text.length, MAX_TEXT_CHARACTERS);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end -= 1;
  return { text: text.slice(0, end), truncated: end < text.length };
}

export async function observeSource(input: {
  task: unknown; sourceUrl: string; now: () => number; signal: AbortSignal; network?: SourceNetwork;
}): Promise<SourceObservation> {
  const task = ResearchTaskSchema.parse(input.task);
  if (!task.brief.sources.includes(input.sourceUrl)) throw new Error('source_outside_task');
  const started = input.now();
  if (started < Date.parse(task.issuedAt) || started >= Date.parse(task.expiresAt)) throw new Error('task_outside_lease');
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal.addEventListener('abort', abort, { once: true });
  if (input.signal.aborted) abort();
  const timer = setTimeout(abort, Math.min(10000, Date.parse(task.expiresAt) - started));
  try {
    const inspected = excerpt(await readPublicSource(input.sourceUrl, controller.signal, input.network));
    const inspectedAt = input.now();
    if (controller.signal.aborted || inspectedAt < started || inspectedAt >= Date.parse(task.expiresAt)) {
      throw new SourceReadError('timeout');
    }
    const receipt = SourceInspectionSchema.parse({ contractVersion: 'research.v1', tenantId: task.tenantId,
      taskId: task.taskId, runId: task.runId, attemptId: task.attemptId, sourceUrl: input.sourceUrl,
      inspectedAt: new Date(inspectedAt).toISOString(), receiptId: randomUUID(),
      contentHash: createHash('sha256').update(inspected.text, 'utf8').digest('hex') });
    return { status: 'inspected', snapshot: { receipt, text: inspected.text }, gaps: [
      'Static HTTP text only; no authenticated access, browser rendering, images, video or engagement verification.',
      ...(inspected.truncated ? [`Source excerpt truncated to ${inspected.text.length} characters: ${input.sourceUrl}`] : []),
    ] };
  } catch (error) {
    if (!(error instanceof SourceReadError)) throw error;
    return { status: 'uninspected', sourceUrl: input.sourceUrl, code: error.code,
      gaps: [`Source not inspected (${error.code}): ${input.sourceUrl}`] };
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener('abort', abort);
  }
}
