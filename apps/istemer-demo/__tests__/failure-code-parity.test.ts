import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('failure-code parity', () => {
  it.each([
    {
      name: 'research',
      workerPath: resolve(__dirname, '../lib/workflow/research-worker.ts'),
      migrationPath: resolve(__dirname, '../../../supabase/migrations/20260916060831_adam_omar_attempt_leases.sql'),
      functionName: 'fail_research_attempt',
    },
    {
      name: 'reel-analysis',
      workerPath: resolve(__dirname, '../lib/workflow/reel-analysis-worker.ts'),
      migrationPath: resolve(__dirname, '../../../supabase/migrations/20260917090000_ziad_reel_analysis_attempts.sql'),
      functionName: 'fail_reel_analysis_attempt',
    },
    {
      name: 'content-calendar',
      workerPath: resolve(__dirname, '../lib/workflow/content-calendar-worker.ts'),
      migrationPath: resolve(__dirname, '../../../supabase/migrations/20260917100000_nour_content_calendar_attempts.sql'),
      functionName: 'fail_content_calendar_attempt',
    },
  ])('$name: TS FAILURE_CODES matches SQL migration', ({ workerPath, migrationPath, functionName }) => {
    const workerSource = readFileSync(workerPath, 'utf8');
    const tsCodesMatch = workerSource.match(/const\s+FAILURE_CODES\s*=\s*new\s+Set\s*<\s*FailureCode\s*>\s*\(\s*\[([^\]]+)\]\s*\)/);

    if (!tsCodesMatch) {
      throw new Error(`Could not find FAILURE_CODES constant in ${workerPath}`);
    }

    const tsCodes = new Set<string>(
      (tsCodesMatch[1] ?? '')
        .split(',')
        .map(code => code.trim())
        .map(code => {
          if (code.startsWith("'") && code.endsWith("'")) {
            return code.slice(1, -1);
          }
          throw new Error(`Unexpected quote format in TS code: ${code}`);
        })
    );

    const migration = readFileSync(migrationPath, 'utf8');
    const failureCodeNotInMatch = migration.match(/failure_code\s+is\s+null\s+or\s+failure_code\s+not\s+in\s*\(([^)]+)\)/);

    if (!failureCodeNotInMatch) {
      throw new Error(`Could not find "failure_code not in (...)" clause in ${functionName}`);
    }

    const sqlCodesString = failureCodeNotInMatch[1] ?? '';
    const sqlCodes = new Set<string>(
      sqlCodesString
        .split(',')
        .map(code => code.trim())
        .map(code => {
          if (code.startsWith("'") && code.endsWith("'")) {
            return code.slice(1, -1);
          }
          throw new Error(`Unexpected quote format in SQL code: ${code}`);
        })
    );

    expect(tsCodes).toEqual(sqlCodes);
  });
});
