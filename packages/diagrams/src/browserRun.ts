import type { RunRequest, RunResult } from '@eraserlabs/render/browser';
import type { AuthoredRecord, Issue } from '@eraserlabs/resolve';
export interface RuntimeFailure {
  stageCode: 'E_PORT' | 'E_UNKNOWN_PORT' | 'E_COMPOSITION' | 'E_ASSET';
  message: string; elementId?: string; property?: string;
}
/** Self-contained function serialized into Chromium, without module closures. */
export async function runWithDiagnostics(payload: RunRequest): Promise<{ ok: true; result: RunResult } | { ok: false; failure: RuntimeFailure }> {
  try { return { ok: true, result: await window.__eraser.run(payload) }; }
  catch (error) {
    const value = error as { code?: unknown; message?: unknown; elementId?: unknown; property?: unknown };
    if (error instanceof Error && typeof value.code === 'string' && ['E_PORT', 'E_UNKNOWN_PORT', 'E_COMPOSITION', 'E_ASSET'].includes(value.code)) {
      return { ok: false, failure: { stageCode: value.code as RuntimeFailure['stageCode'], message: error.message,
        ...(typeof value.elementId === 'string' ? { elementId: value.elementId } : {}), ...(typeof value.property === 'string' ? { property: value.property } : {}) } };
    }
    throw error;
  }
}
export function sourcePaths(request: unknown, authored: readonly AuthoredRecord[]): Map<string, string> {
  const paths = new Map<unknown, string>(); const document = request as Record<string, unknown>;
  for (const key of ['elements', 'entities', 'connections']) { const list = document[key]; if (Array.isArray(list)) { list.forEach((source, index) => paths.set(source, `/${key}/${index}`)); } }
  return new Map(authored.map(({ id, source }) => [id, paths.get(source) ?? '']));
}
/** Preserve the resolver Issue contract; stageCode carries the precise runtime category. */
export function runtimeIssue(failure: RuntimeFailure, paths: Map<string, string>): Issue & { stageCode: string } {
  const base = failure.elementId ? paths.get(failure.elementId) ?? '' : '';
  return { code: 'E_SCHEMA', stageCode: failure.stageCode, severity: 'error', path: base + (failure.property ? `/${failure.property}` : ''),
    message: failure.message, ...(failure.elementId ? { elementId: failure.elementId } : {}) };
}
