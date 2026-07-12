const db = require('../core/db'); // Points to your unified native SQLite module

function handleStatus() {
  console.log(`[CLI] Status command triggered.`);
  console.log(`[CLI] Summarizing all job states & active workers...`);

  try {
    // 1. Fetch counts for all job states in a single query sweep
    const jobCounts = db.prepare(`
      SELECT state, COUNT(*) as count 
      FROM jobs 
      GROUP BY state
    `).all();

    // Initialize map with zeroes for all required project assignment states
    const stats = { pending: 0, processing: 0, completed: 0, failed: 0, dead: 0 };
    
    // Map database results into our structure
    jobCounts.forEach(row => {
      if (stats[row.state] !== undefined) {
        stats[row.state] = row.count;
      }
    });

    // 2. Query total active worker processes registered on disk
    const workerRow = db.prepare("SELECT COUNT(*) as count FROM active_workers").get();
    const workerCount = workerRow ? workerRow.count : 0;

    // 3. Render a structured, scannable dashboard summary layout
    console.log("\n=================================");
    console.log("QUEUE SYSTEM STATUS MATRIX");
    console.log("=================================");
    console.log(` Active OS Workers : ${workerCount}`);
    console.log("---------------------------------");
    console.log(` Pending Jobs     : ${stats.pending}`);
    console.log(` Processing Jobs  : ${stats.processing}`);
    console.log(` Completed Jobs   : ${stats.completed}`);
    console.log(`  Failed Retries    : ${stats.failed}`);
    console.log(` Dead Letter (DLQ) : ${stats.dead}`);
    console.log("=================================\n");

    process.exit(0);
  } catch (error) {
    console.error(`[CLI Error] Failed to generate system status metrics: ${error.message}`);
    process.exit(1);
  }
}

module.exports = handleStatus;