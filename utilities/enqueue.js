const db = require('../core/db'); // Points to your unified native SQLite module

function handleEnqueue(args) {
  // Grab the raw JSON payload string (e.g., '{"id":"job1", "command":"sleep 2"}')
  const jsonPayload = args[0];

  if (!jsonPayload) {
    console.error("[CLI Error] Please provide a valid JSON payload string.");
    process.exit(1);
  }

  try {
    // 1. Parse the incoming argument string into a structured object
    const parsedJob = JSON.parse(jsonPayload);

    // 2. Enforce the structural contract required by the assignment
    if (!parsedJob.id || !parsedJob.command) {
      console.error("[CLI Error] Invalid layout. The job payload must contain both an 'id' and a 'command'.");
      process.exit(1);
    }

    const now = new Date().toISOString();
    // Default max_retries to 3 if the user didn't specify it in the JSON
    const maxRetries = parsedJob.max_retries !== undefined ? parsedJob.max_retries : 3;

    // 3. Prepare the native SQL insertion statement
    const insertStmt = db.prepare(`
      INSERT INTO jobs (id, command, state, attempts, max_retries, run_at, created_at, updated_at)
      VALUES (?, ?, 'pending', 0, ?, ?, ?, ?)
    `);

    // 4. Run the query to persist the job task permanently to disk
    insertStmt.run(
      parsedJob.id,
      parsedJob.command,
      maxRetries,
      now, // run_at is set to now so idle workers pick it up instantly
      now, // created_at
      now  // updated_at
    );

    console.log(`[CLI] Successfully enqueued job: ${parsedJob.id}`);
    process.exit(0);

  } catch (error) {
    // Gracefully catch duplicate keys instead of crashing the process
    if (error.message.includes('UNIQUE constraint failed')) {
      console.error(`[CLI Error] Conflict: A job with ID "${JSON.parse(jsonPayload).id}" already exists.`);
    } else {
      console.error(`[CLI Error] Runtime failure while enqueuing: ${error.message}`);
    }
    process.exit(1);
  }
}

module.exports = handleEnqueue;