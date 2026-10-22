import { ReportingError, type GitHubClient } from './github.js';
import { object } from './policy.js';

export interface ReportArtifact {
  id: number;
  digest: string;
  reportId: string;
  command: 'lint' | 'run';
}

export function reportArtifactName(reportId: string, command: string, attempt: number, suffix: string): string {
  return `evals-report.${reportId}.${command}.${attempt}.${suffix}`;
}

export async function discoverReportArtifacts(
  client: GitHubClient,
  context: { repository: string; runId: number; attempt: number; reportId: string },
  includeLint = true,
): Promise<{ run?: ReportArtifact; lint?: ReportArtifact }> {
  const found: { run?: ReportArtifact; lint?: ReportArtifact } = {};
  const prefix = context.reportId.replace(/-(?:lint|run)$/, '');
  for (let page = 1; ; page++) {
    if (page > 100) throw new ReportingError('artifact-pagination-limit');
    const response = object(await client.request(
      'GET', `/repos/${context.repository}/actions/runs/${context.runId}/artifacts?per_page=100&page=${page}`,
    ));
    if (!Array.isArray(response.artifacts)) throw new ReportingError('invalid-artifact-list');
    for (const value of response.artifacts) {
      const artifact = object(value);
      if (typeof artifact.name !== 'string') throw new ReportingError('invalid-artifact-list');
      const match = /^evals-report\.([A-Za-z0-9][A-Za-z0-9_-]{0,63})\.(lint|run)\.([1-9]\d*)\.[A-Za-z0-9]{6}$/.exec(artifact.name);
      if (!match || Number(match[3]) !== context.attempt) continue;
      const reportId = match[1]!;
      const command = match[2] as 'lint' | 'run';
      if ((!includeLint && command === 'lint') ||
          (reportId !== context.reportId && reportId !== `${prefix}-${command}`)) continue;
      if (found[command]) throw new ReportingError('ambiguous-report-artifacts');
      if (artifact.expired !== false) throw new ReportingError('report-artifact-expired');
      if (typeof artifact.id !== 'number' || !Number.isSafeInteger(artifact.id) || artifact.id < 1 ||
          object(artifact.workflow_run).id !== context.runId) {
        throw new ReportingError('invalid-artifact-identity');
      }
      if (typeof artifact.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest)) {
        throw new ReportingError('artifact-digest-unavailable');
      }
      found[command] = { id: artifact.id, digest: artifact.digest.slice(7), reportId, command };
    }
    if (response.artifacts.length < 100) return found;
  }
}
