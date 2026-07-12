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

    process.on("SIGINT", () => {
      try {
        db.prepare("DELETE FROM active_workers WHERE pid = ?").run(currentPid);
      } catch (e) {}
      process.exit(0);
    });

    setInterval(() => {
      try {
        const currentTime = new Date().toISOString();

        // 1. Pack the inline transaction into an executable function wrapper
        const claimTransaction = () => {
          db.exec("BEGIN IMMEDIATE;");
          try {
            const job = db
              .prepare(
                `
              SELECT * FROM jobs 
              WHERE (state = 'pending' OR state = 'failed') AND run_at <= ?
                 OR (state = 'processing' AND locked_until <= ?)
              LIMIT 1
            `,
              )
              .get(currentTime, currentTime);

            if (!job) {
              db.exec("COMMIT;");
              return null;
            }

            const visibilityTimeout = new Date(
              Date.now() + 30000,
            ).toISOString();

            db.prepare(
              `
              UPDATE jobs 
              SET state = 'processing', locked_until = ?, updated_at = ? 
              WHERE id = ?
            `,
            ).run(visibilityTimeout, currentTime, job.id);

            db.exec("COMMIT;");
            return job;
          } catch (err) {
            db.exec("ROLLBACK;");
            throw err;
          }
        };

        // 2. Safely capture the return object while handling transient file locks
        let assignedJob = null;
        try {
          assignedJob = claimTransaction();
        } catch (lockError) {
          if (
            lockError.code === "ERR_SQLITE_ERROR" &&
            lockError.message.includes("locked")
          ) {
            return; // Back out quietly and let the other process finish writing
          }
          throw lockError;
        }

        // 3. Natively execute the job payload command string inside an OS shell
        if (assignedJob) {
          console.log(
            `[Worker ${currentPid}] ⚡ Claimed job: "${assignedJob.id}". Executing...`,
          );

          const { exec } = require("node:child_process");

          exec(assignedJob.command, (error, stdout, stderr) => {
            const finishedTime = new Date().toISOString();

            if (!error) {
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
              console.error(
                `[Worker ${currentPid}] Job "${assignedJob.id}" failed execution.`,
              );
              const nextAttempt = assignedJob.attempts + 1;
              if (nextAttempt >= assignedJob.max_retries) {
                console.error(
                  `[Worker ${currentPid}]  Job "${assignedJob.id}" failed permanently after ${nextAttempt}/${assignedJob.max_retries} attempts. Moving to DLQ.`,
                );
                db.prepare(
                  `
                  UPDATE jobs 
                  SET state = 'dead', attempts = ?, updated_at = ? 
                  WHERE id = ?
                `,
                ).run(nextAttempt, finishedTime, assignedJob.id);
              } else {
                const backoffSeconds = Math.pow(2, nextAttempt);
                const futureRunTime = new Date(
                  Date.now() + backoffSeconds * 1000,
                ).toISOString();
                console.warn(
                  `[Worker ${currentPid}F] Job "${assignedJob.id}" failed (Attempt ${nextAttempt}/${assignedJob.max_retries}). Retrying in ${backoffSeconds}s...`,
                );

                db.prepare(
                  `
                  UPDATE jobs 
                  SET state = 'failed', attempts = ?, run_at = ?, updated_at = ? 
                  WHERE id = ?
                `,
                ).run(nextAttempt, futureRunTime, finishedTime, assignedJob.id);
              }
            }
          });
        }
      } catch (error) {
        console.error(
          `[Worker ${currentPid}] Error during polling: ${error.message}`,
        );
      }
    }, 1000); // Poll every second to stay responsive [
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
