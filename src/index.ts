import * as core from '@actions/core';
import { DefaultArtifactClient } from '@actions/artifact';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseInputs } from './inputs.js';
import { assertRevision, eventEligibility, inertEnvironment, projectDirectory } from './policy.js';
import { requireRuntime, runtimeBlocker } from './runtime.js';
import { renderSummary, structuredReport, type Report } from './reporting.js';

const execute = promisify(execFile);

async function main(): Promise<void> {
  const report: Report = {
    schemaVersion: 1, command: 'unknown', outcome: 'error', completeness: 'unknown',
    revision: /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '') ? process.env.GITHUB_SHA! : 'unknown',
    category: 'configuration', code: 'invalid-input-or-context',
  };
  let inputs: ReturnType<typeof parseInputs> | undefined;
  try {
    inputs = parseInputs((name) => core.getInput(name, { trimWhitespace: false }));
    report.command = inputs.command;
    if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Only Linux x64 runners are supported.');
    const payload: unknown = JSON.parse(await readFile(requiredEnv('GITHUB_EVENT_PATH'), 'utf8'));
    if (eventEligibility(requiredEnv('GITHUB_EVENT_NAME'), payload, requiredEnv('GITHUB_REPOSITORY')) === 'fork') {
      report.outcome = 'not-run';
      report.category = 'policy';
      report.code = 'fork-execution-excluded';
      report.executed = 0;
      core.warning('Fork pull requests are excluded. No evaluator or installer was started.');
    } else {
      const cwd = await projectDirectory(requiredEnv('GITHUB_WORKSPACE'), inputs.workingDirectory);
      const revision = await execute('git', ['-C', cwd, 'rev-parse', 'HEAD'], {
        env: inertEnvironment(process.env), timeout: 10_000, maxBuffer: 4096,
      });
      assertRevision(revision.stdout, requiredEnv('GITHUB_SHA'));
      report.category = 'dependency';
      report.code = 'headless-runtime-unavailable';
      requireRuntime();
    }
  } catch {
    // Do not echo exceptions: external paths, process stderr and configuration can contain private data.
    core.setFailed(report.category === 'dependency' ? runtimeBlocker : 'Invalid Action inputs or workflow context. See the documented input and event requirements.');
  }
  core.setOutput('outcome', report.outcome);
  core.setOutput('plan-completeness', report.completeness);
  if (report.executed !== undefined) core.setOutput('executed', report.executed);
  await core.summary.addRaw(renderSummary(report)).write();
  if (inputs?.comment) core.warning('Optional PR commenting is not integrated in this development preview. The operation outcome is unchanged.');
  if (inputs?.uploadTranscripts) core.warning('Transcript upload is unavailable until canonical evidence integration. No raw files were uploaded.');
  const directory = await mkdtemp(join(requiredEnv('RUNNER_TEMP'), 'evals-report-'));
  const path = join(directory, 'report.json');
  await writeFile(path, structuredReport(report), { mode: 0o600 });
  core.setOutput('result-path', path);
  const artifact = await new DefaultArtifactClient().uploadArtifact(
    `evals-${inputs?.reportId ?? 'invalid'}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}-${directory.slice(-6)}`,
    [path], directory, { retentionDays: inputs?.retentionDays ?? 7 },
  );
  if (artifact.id !== undefined) core.setOutput('artifact-id', artifact.id);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is missing.`);
  return value;
}

main().catch(() => core.setFailed('Required structured reporting failed. No evaluation pass is claimed.'));
