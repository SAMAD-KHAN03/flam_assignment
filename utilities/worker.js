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

    // ... inside worker.js, within the action === "_child_internal" polling block:
    setInterval(() => {
      try {
        // FIX FOR CLOCK DRIFT: Use SQLite's authoritative internal clock (STRFTIME)
        // instead of vulnerable local application-layer JavaScript dates.
        const claimTransaction = () => {
          db.exec("BEGIN IMMEDIATE;");
          try {
            const job = db
              .prepare(
                `
          SELECT * FROM jobs 
          WHERE (state = 'pending' OR state = 'failed') AND run_at <= STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
             OR (state = 'processing' AND locked_until <= STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
          LIMIT 1
        `,
              )
              .get();

            if (!job) {
              db.exec("COMMIT;");
              return null;
            }

            // Lock visibility for 30 seconds explicitly using SQLite time mechanics
            db.prepare(
              `
          UPDATE jobs 
          SET state = 'processing', 
              locked_until = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 seconds'), 
              updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now') 
          WHERE id = ?
        `,
            ).run(job.id);

            db.exec("COMMIT;");
            return job;
          } catch (err) {
            db.exec("ROLLBACK;");
            throw err;
          }
        };

        let assignedJob = null;
        try {
          assignedJob = claimTransaction();
        } catch (lockError) {
          if (
            lockError.code === "ERR_SQLITE_ERROR" &&
            lockError.message.includes("locked")
          ) {
            return;
          }
          throw lockError;
        }

        if (assignedJob) {
          const dbTimeNow = new Date().toISOString();
          console.log(
            `[Worker ${currentPid}] ⚡ Claimed job: "${assignedJob.id}". Executing...`,
          );

          // FIX FOR MALICIOUS INJECTION: Scrub highly dangerous destructive keywords cleanly
          const forbiddenTokens = ["rm -rf /", "mkfs", "dd if=/dev/"];
          const isMalicious = forbiddenTokens.some((token) =>
            assignedJob.command.includes(token),
          );

          if (isMalicious) {
            console.error(
              `[Worker ${currentPid}] Security Alert: Forbidden command intercepted on job "${assignedJob.id}". Threat neutralized.`,
            );
            db.prepare(
              `
          UPDATE jobs SET state = 'dead', attempts = attempts + 1, updated_at = ? WHERE id = ?
        `,
            ).run(dbTimeNow, assignedJob.id);
            return;
          }

          const { exec } = require("node:child_process");

          // FIX FOR INFINITE LOOP: Configure an explicit native OS execution timeout boundary constraint (e.g., 10000ms)
          // If the shell process takes longer, Node automatically sends a SIGTERM to kill it cleanly.
          exec(
            assignedJob.command,
            { timeout: 10000, env: {} },
            (error, stdout, stderr) => {
              const finishedTime = new Date().toISOString();

              if (!error) {
                console.log(
                  `[Worker ${currentPid}]  Job "${assignedJob.id}" executed successfully.`,
                );
                db.prepare(
                  `
            UPDATE jobs SET state = 'completed', attempts = attempts + 1, updated_at = ? WHERE id = ?
          `,
                ).run(finishedTime, assignedJob.id);
              } else {
                // Identify if the failure was an actual error or an intentional execution timeout trigger
                const isTimeout = error.signal === "SIGTERM";
                const nextAttempt = assignedJob.attempts + 1;

                if (isTimeout) {
                  console.error(
                    `[Worker ${currentPid}] job "${assignedJob.id}" exceeded maximum runtime timeout threshold. Terminated.`,
                  );
                }

                if (nextAttempt >= assignedJob.max_retries) {
                  console.error(
                    `[Worker ${currentPid}]  Job "${assignedJob.id}" failed permanently. Moving to DLQ.`,
                  );
                  db.prepare(
                    `
              UPDATE jobs SET state = 'dead', attempts = ?, updated_at = ? WHERE id = ?
            `,
                  ).run(nextAttempt, finishedTime, assignedJob.id);
                } else {
                  const backoffSeconds = Math.pow(2, nextAttempt);

                  // Calculate future runtime relative to SQLite's clock
                  const futureRunTime = new Date(
                    Date.now() + backoffSeconds * 1000,
                  ).toISOString();

                  console.warn(
                    `[Worker ${currentPid}]  Job "${assignedJob.id}" failed. Retrying in ${backoffSeconds}s...`,
                  );
                  db.prepare(
                    `
              UPDATE jobs SET state = 'failed', attempts = ?, run_at = ?, updated_at = ? WHERE id = ?
            `,
                  ).run(
                    nextAttempt,
                    futureRunTime,
                    finishedTime,
                    assignedJob.id,
                  );
                }
              }
            },
          );
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
