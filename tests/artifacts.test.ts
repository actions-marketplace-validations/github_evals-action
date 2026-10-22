import { expect, it, vi } from 'vitest';
import { discoverReportArtifacts, reportArtifactName } from '../src/artifacts.js';
import { type GitHubClient, ReportingError } from '../src/github.js';

const context = { repository: 'o/r', runId: 100, attempt: 2, reportId: 'evals' };
const artifact = (command = 'run', overrides: Record<string, unknown> = {}) => ({
  id: command === 'run' ? 123 : 124, name: reportArtifactName('evals', command, 2, 'ABC123'),
  digest: `sha256:${'d'.repeat(64)}`, expired: false, workflow_run: { id: 100 }, ...overrides,
});
function fixture(artifacts: unknown[]) {
  const request = vi.fn<GitHubClient['request']>(async (_method, path) => {
    const page = Number(new URL(`https://example.test${path}`).searchParams.get('page'));
    return { artifacts: artifacts.slice((page - 1) * 100, page * 100) };
  });
  return { request };
}

it('discovers only structured reports for the selected identity and attempt in the current run', async () => {
  const client = fixture([
    artifact('run'), artifact('lint'),
    artifact('run', { name: reportArtifactName('other', 'run', 2, 'ABC123') }),
    artifact('run', { name: reportArtifactName('evals', 'run', 1, 'ABC123') }),
    { name: 'evals-transcripts-evals-ABC123' }, { name: 'unrelated' },
  ]);
  expect(await discoverReportArtifacts(client, context)).toEqual({
    run: { id: 123, digest: 'd'.repeat(64), reportId: 'evals', command: 'run' },
    lint: { id: 124, digest: 'd'.repeat(64), reportId: 'evals', command: 'lint' },
  });
  expect(client.request).toHaveBeenCalledExactlyOnceWith(
    'GET', '/repos/o/r/actions/runs/100/artifacts?per_page=100&page=1',
  );
});

it('recognizes suffixed identities and all-mode companion lint reports', async () => {
  const client = fixture([
    artifact('run', { name: reportArtifactName('evals-run', 'run', 2, 'ABC123') }),
    artifact('lint', { name: reportArtifactName('evals-lint', 'lint', 2, 'ABC123') }),
  ]);
  expect(await discoverReportArtifacts(client, context)).toMatchObject({
    run: { reportId: 'evals-run' }, lint: { reportId: 'evals-lint' },
  });
});

it('paginates before selecting evidence and rejects duplicates even on later pages', async () => {
  const artifacts = [artifact(), ...Array.from({ length: 99 }, () => ({ name: 'unrelated' })), artifact('lint')];
  const client = fixture(artifacts);
  expect(await discoverReportArtifacts(client, context)).toHaveProperty('lint.id', 124);
  expect(client.request).toHaveBeenCalledTimes(2);
  await expect(discoverReportArtifacts(fixture([...artifacts, artifact('run', { id: 125 })]), context))
    .rejects.toThrow('ambiguous-report-artifacts');
});

it('does not guess between suffixed and shared identities or inspect overridden lint artifacts', async () => {
  const client = fixture([
    artifact('run'),
    artifact('lint', { expired: true }),
    artifact('lint', { name: reportArtifactName('evals-lint', 'lint', 2, 'ABC123') }),
  ]);
  expect(await discoverReportArtifacts(client, context, false)).toEqual({
    run: { id: 123, digest: 'd'.repeat(64), reportId: 'evals', command: 'run' },
  });
  await expect(discoverReportArtifacts(fixture([
    artifact('run'), artifact('run', { name: reportArtifactName('evals-run', 'run', 2, 'ABC123') }),
  ]), context)).rejects.toThrow('ambiguous-report-artifacts');
});

it.each([
  [{ expired: true }, 'report-artifact-expired'],
  [{ expired: undefined }, 'report-artifact-expired'],
  [{ id: 0 }, 'invalid-artifact-identity'],
  [{ id: '123' }, 'invalid-artifact-identity'],
  [{ workflow_run: { id: 101 } }, 'invalid-artifact-identity'],
  [{ digest: undefined }, 'artifact-digest-unavailable'],
  [{ digest: 'md5:abcd' }, 'artifact-digest-unavailable'],
])('rejects unusable matching metadata %j', async (overrides, code) => {
  await expect(discoverReportArtifacts(fixture([artifact('run', overrides)]), context)).rejects.toThrow(code);
});

it('returns no matches without choosing unrelated or previous-attempt evidence', async () => {
  expect(await discoverReportArtifacts(fixture([
    artifact('run', { name: reportArtifactName('evals', 'run', 1, 'ABC123') }),
  ]), context)).toEqual({});
});

it('fails malformed listings, permission errors and unbounded pagination explicitly', async () => {
  const request = vi.fn<GitHubClient['request']>();
  for (const value of [{}, { artifacts: [null] }, { artifacts: [{}] }]) {
    request.mockResolvedValue(value);
    await expect(discoverReportArtifacts({ request }, context)).rejects.toThrow();
  }
  request.mockRejectedValue(new ReportingError('github-http-403'));
  await expect(discoverReportArtifacts({ request }, context)).rejects.toThrow('github-http-403');
  request.mockResolvedValue({ artifacts: Array.from({ length: 100 }, () => ({ name: 'unrelated' })) });
  await expect(discoverReportArtifacts({ request }, context)).rejects.toThrow('artifact-pagination-limit');
});
