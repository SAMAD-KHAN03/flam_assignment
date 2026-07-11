const process = require("node:process");
const { fork } = require("node:child_process");
const path = require("node:path");
const db = require("../core/db");

function handleWorker(args) {
  const action = args[0]; // 'start' or 'stop'

  if (action === "start") {
    // 1. Parse the count argument dynamically
    const countIndex = args.indexOf("count");
    const workerCount =
      countIndex !== -1 ? parseInt(args[countIndex + 1], 10) : 1;

    console.log(
      `[Coordinator] Spawning ${workerCount} parallel worker processes...`,
    );

    // 2. Fork separate, isolated OS processes
    for (let i = 0; i < workerCount; i++) {
      // This tells Node to spin up this exact file again, but as an isolated child worker
      fork("./queuectl.js", ["_child_internal"]);
    }

    // INTERNAL ROUTE: This block is executed ONLY by the individual background child processes
  } else if (action === "_child_internal") {
    const currentPid = process.pid;
    const now = new Date().toISOString();

    // High-concurrency safe retry loop for PID registration
    const insertStmt = db.prepare(
      "INSERT INTO active_workers (pid, started_at) VALUES (?, ?)",
    );
    let registered = false;
    let attempts = 0;
    while (!registered && attempts < 5) {
      try {
        insertStmt.run(currentPid, now);
        registered = true;
      } catch (e) {
        attempts++;
        const sab = new SharedArrayBuffer(4);
        const int32 = new Int32Array(sab);
        Atomics.wait(int32, 0, 0, 50);
      }
    }

    console.log(
      `[Worker Process] Booted and registered unique PID: ${currentPid}`,
    );

    // Clean up registry if process is closed manually (Ctrl+C) [cite: 44]
    process.on("SIGINT", () => {
      try {
        db.prepare("DELETE FROM active_workers WHERE pid = ?").run(currentPid);
      } catch (e) {}
      process.exit(0);
    });

    setInterval(() => {
      try {
        const currentTime = new Date().toISOString();

        // ATOMIC OPERATION BLOCK: Claim a job uniquely across separate processes [cite: 67, 68, 104]
        // We look for jobs that are pending/failed and ready to run, OR processing jobs that crashed (expired timeout) [cite: 34, 36]
        const claimTransaction = db.transaction(() => {
          const selectJob = db.prepare(`
            SELECT * FROM jobs 
            WHERE (state = 'pending' OR state = 'failed') AND run_at <= ?
            OR (state = 'processing' AND locked_until <= ?)
            LIMIT 1
          `);

          const job = selectJob.get(currentTime, currentTime);
          if (!job) return null;

          // Immediately lock the job for 30 seconds to satisfy the Crash Rule [cite: 35, 36, 37]
          const visibilityTimeout = new Date(Date.now() + 30000).toISOString();

          db.prepare(
            `
            UPDATE jobs 
            SET state = 'processing', locked_until = ?, updated_at = ? 
            WHERE id = ?
          `,
          ).run(visibilityTimeout, currentTime, job.id);

          return job;
        });

        // Run the atomic transaction block safely
        const assignedJob = claimTransaction();

        if (assignedJob) {
          console.log(
            `[Worker ${currentPid}] ⚡ Claimed job: "${assignedJob.id}". Executing...`,
          );

          // Natively spawn an OS sub-shell execution environment
          const { exec } = require("node:child_process");

          exec(assignedJob.command, (error, stdout, stderr) => {
            const finishedTime = new Date().toISOString();

            if (!error) {
              // --- THE HAPPY PATH COMPLETION ---
              console.log(
                `[Worker ${currentPid}] ✅ Job "${assignedJob.id}" executed successfully.`,
              );

              db.prepare(
                `
        UPDATE jobs 
        SET state = 'completed', attempts = attempts + 1, updated_at = ? 
        WHERE id = ?
      `,
              ).run(finishedTime, assignedJob.id);
            } else {
              // --- CRASH/ERROR PLACEHOLDER ---
              console.error(
                `[Worker ${currentPid}] ❌ Job "${assignedJob.id}" failed execution.`,
              );
            }
          });
        }
      } catch (error) {
        console.error(
          `[Worker ${currentPid}] Error during polling: ${error.message}`,
        );
      }
    }, 1000); // Poll every second to stay responsive [cite: 37]
  } else if (action === "stop") {
    // 3. Global Stop Logic [cite: 42, 47]
    const rows = db.prepare("SELECT pid FROM active_workers").all();

    if (rows.length === 0) {
      console.log("[Worker Stop] No running workers detected.");
      process.exit(0);
    }

    console.log(
      `[Worker Stop] Signaling ${rows.length} workers to stop gracefully...`,
    );

    rows.forEach((row) => {
      try {
        process.kill(row.pid, "SIGTERM"); // Triggers graceful termination routine [cite: 44]
      } catch (err) {
        db.prepare("DELETE FROM active_workers WHERE pid = ?").run(row.pid);
      }
    });

    db.exec("DELETE FROM active_workers;");
    process.exit(0);
  }
}

module.exports = handleWorker;
