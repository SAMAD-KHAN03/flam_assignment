function handleHelp() {
  console.log(`
===================================================================
🛠️  DISTRIBUTED TRANSACTIONAL QUEUE MANAGEMENT SYSTEM (CLI MANUAL)
===================================================================

USAGE:
  node queuectl <command> [arguments]

AVAILABLE COMMANDS:
  enqueue '<json>'       Ingest a new job payload command string into the queue.
                         Format: '{"id": "job-1", "command": "sleep 2", "max_retries": 3}'

  worker start count <n> Spawn a pool of <n> parallel processing daemon workers.
  worker stop            Issue a cross-process SIGTERM to stop all active daemons.

  status                 Display real-time system dashboard counters and worker counts.
  list [state]           Render a tabular view of all jobs (optional: filter by state).

  dlq list               Display inventory logs of permanently dead tasks.
  dlq retry <job_id>     Rescue a specific job ID (or omit ID to rescue ALL dead jobs).

  config                 Inspect internal engine runtime properties and timeout values.
  help                   Print this command reference manual screen.

===================================================================
`);
  process.exit(0);
}

module.exports = handleHelp;