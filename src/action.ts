import * as core from '@actions/core';
import { DefaultArtifactClient } from '@actions/artifact';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseInputs } from './inputs.js';
import { assertRevision, eventEligibility, inertEnvironment, object, projectDirectory } from './policy.js';
import { requireRuntime, runtimeBlocker } from './runtime.js';
import { renderSummary, structuredReport, type Report } from './reporting.js';
import { githubClient, ReportingError, takeReportToken } from './github.js';
import { postReport } from './reporter.js';
import { sha256 } from './tooling.js';

const execute = promisify(execFile);

export async function runAction(): Promise<void> {
  const reportToken = takeReportToken(() => core.getInput('report-token'), process.env, core.setSecret);
  const report: Report = {
    schemaVersion: 1, command: 'unknown', outcome: 'error', completeness: 'unknown',
    revision: /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '') ? process.env.GITHUB_SHA! : 'unknown',
    category: 'configuration', code: 'invalid-input-or-context',
  };
  let inputs: ReturnType<typeof parseInputs> | undefined;
  let pullNumber: number | undefined;
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
      if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
        const number = object(payload).number;
        if (typeof number === 'number' && Number.isSafeInteger(number) && number > 0) pullNumber = number;
      }
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
  if (inputs?.comment) {
    let warning: string | undefined;
    if (pullNumber === undefined) {
      warning = 'comment-context-excluded: only a verified same-repository pull request can receive a report.';
    } else {
      try {
        const outcome = await postReport(githubClient(reportToken, requiredEnv('RUNNER_TEMP')), {
          repository: requiredEnv('GITHUB_REPOSITORY'), workflowRef: requiredEnv('GITHUB_WORKFLOW_REF'),
          workflowSha: requiredEnv('GITHUB_WORKFLOW_SHA'), job: requiredEnv('GITHUB_JOB'), reportId: inputs.reportId,
          selection: sha256(JSON.stringify([inputs.suite ?? '', inputs.evalPaths, inputs.tags])),
          pullNumber, runId: Number(requiredEnv('GITHUB_RUN_ID')),
          order: { runNumber: Number(requiredEnv('GITHUB_RUN_NUMBER')), attempt: Number(requiredEnv('GITHUB_RUN_ATTEMPT')) },
        }, report, artifact.id);
        if (outcome === 'stale') warning = 'stale-report-skipped: a newer run or attempt already owns the report.';
      } catch (error) {
        warning = `${error instanceof ReportingError ? error.code : 'comment-reporting-failed'}: optional PR reporting did not complete.`;
      }
    }
    if (warning) {
      core.warning(warning);
      try {
        await core.summary.addRaw(`\nReporting warning: ${warning} The operation outcome is unchanged.\n`).write();
      } catch {
        core.warning('Optional PR reporting warning could not be appended to the summary. The operation outcome is unchanged.');
      }
    }
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is missing.`);
  return value;
}
