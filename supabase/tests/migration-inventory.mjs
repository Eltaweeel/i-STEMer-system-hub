// Explicit inventory: additions require updating both baseline and chain coverage.
export const migrationNames = [
  '20260909165106_phase_1a_schema_security.sql',
  '20260915224433_mvp_security_hardening.sql',
  '20260915225316_mvp_workflow_command.sql',
  '20260915225557_mvp_artifact_persistence.sql',
  '20260915225738_mvp_approval_command.sql',
  '20260915230015_mvp_workflow_recovery.sql',
  '20260916055804_adam_omar_durable_tasks.sql',
  '20260916060831_adam_omar_attempt_leases.sql',
  '20260916061530_adam_omar_research_completion.sql',
  '20260917090000_ziad_reel_analysis_attempts.sql',
  '20260917090100_ziad_reel_analysis_completion.sql',
  '20260917100000_nour_content_calendar_attempts.sql',
  '20260917100100_nour_content_calendar_completion.sql',
  '20260918070000_adam_ziad_auto_enqueue.sql',
  '20260918070100_adam_nour_auto_enqueue.sql',
  '20260920090000_adam_upstream_artifact_handoff.sql',
];
