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

    // 1. Prepare the query
    const insertStmt = db.prepare(
      "INSERT INTO active_workers (pid, started_at) VALUES (?, ?)",
    );

    // 2. High-concurrency safe retry loop
    let registered = false;
    let attempts = 0;

    while (!registered && attempts < 5) {
      try {
        insertStmt.run(currentPid, now);
        registered = true;
      } catch (error) {
        if (error.code === "ERR_SQLITE_ERROR") {
          attempts++;
          // Wait 50ms before retrying to let the other process finish writing
          const sab = new SharedArrayBuffer(4);
          const int32 = new Int32Array(sab);
          Atomics.wait(int32, 0, 0, 50);
        } else {
          console.error(`[Worker Process] Critical DB Error: ${error.message}`);
          process.exit(1);
        }
      }
    }

    if (!registered) {
      console.error(
        `[Worker Process: ${currentPid}] Failed to register PID after multiple retries due to database locks.`,
      );
      process.exit(1);
    }

    console.log(
      `[Worker Process] Booted and registered unique PID: ${currentPid}`,
    );

    // Clean up registry if process is closed manually (Ctrl+C) [cite: 44]
    process.on("SIGINT", () => {
      const deleteStmt = db.prepare("DELETE FROM active_workers WHERE pid = ?");
      try {
        deleteStmt.run(currentPid);
      } catch (e) {}
      process.exit(0);
    });

    // Worker stand-by execution loop [cite: 43]
    setInterval(() => {
      console.log(
        `[Worker Process: ${currentPid}] Standing by for incoming database jobs...`,
      );
    }, 4000);
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
