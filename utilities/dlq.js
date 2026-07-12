const db = require('../core/db');

function handleDlq(args) {
  const subAction = args[0]; // 'list' or 'retry'

  try {
    if (subAction === 'list') {
      // Fetch only permanently dead tasks
      const deadJobs = db.prepare(`
        SELECT id, command, attempts, max_retries, updated_at as failed_at 
        FROM jobs 
        WHERE state = 'dead'
        ORDER BY updated_at DESC
      `).all();

      if (deadJobs.length === 0) {
        console.log("[DLQ] The Dead Letter Queue is currently completely empty.");
        process.exit(0);
      }

      console.log(`\nDisplaying ${deadJobs.length} permanently failed jobs (DLQ):`);
      console.table(deadJobs);
      process.exit(0);

    } else if (subAction === 'retry') {
      const jobId = args[1]; // e.g., `node queuectl dlq retry flaky-test`

      if (!jobId) {
        // If no specific ID is provided, retry ALL dead jobs at once
        const result = db.prepare(`
          UPDATE jobs 
          SET state = 'pending', attempts = 0, run_at = ?, updated_at = ? 
          WHERE state = 'dead'
        `).run(new Date().toISOString(), new Date().toISOString());

        console.log(`[DLQ] Successfully re-queued ${result.changes} dead jobs back into circulation.`);
        process.exit(0);
      } else {
        // Retry a single target job
        const result = db.prepare(`
          UPDATE jobs 
          SET state = 'pending', attempts = 0, run_at = ?, updated_at = ? 
          WHERE id = ? AND state = 'dead'
        `).run(new Date().toISOString(), new Date().toISOString(), jobId);

        if (result.changes === 0) {
          console.error(`[DLQ Error] Job "${jobId}" was not found in the Dead Letter Queue.`);
          process.exit(1);
        }

        console.log(`[DLQ] Job "${jobId}" successfully rescued and re-queued as pending!`);
        process.exit(0);
      }
    } else {
      console.log("Usage: queuectl dlq [list | retry <job_id>]");
      process.exit(1);
    }
  } catch (error) {
    console.error(`[CLI Error] DLQ operation failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = handleDlq;