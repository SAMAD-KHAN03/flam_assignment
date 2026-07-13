# Distributed Transactional Task Queue Engine (`queuectl`)

A production-grade, highly concurrent, distributed task execution queue built natively with **Node.js** and **SQLite**. This implementation requires **zero external npm dependencies** and relies entirely on built-in Node.js modules (`node:sqlite`, `node:child_process`, etc.).

## 🏗️ Architectural Overview

The engine operates on a shared-storage daemon cluster architecture. When multiple workers are spawned via the CLI, a Coordinator process isolates execution threads using `child_process.fork()`.

### High-Concurrency Safeguards

- **Atomic Dequeuing Locks:** Implements an exclusive `BEGIN IMMEDIATE` database transaction strategy. This guarantees that no two workers can claim or execute the same job payload simultaneously across separate OS processes.
- **Bare-Metal Boot Safety:** Leverages an inter-process lock mitigation backoff built using `SharedArrayBuffer` and `Atomics.wait()` to eliminate `database is locked` race conditions when processes spawn at the exact same millisecond.
- **Crash Safety Rule Implementation:** Queries for records left trapped in a `processing` state whose lock visibility windows (`locked_until`) have expired, rescuing tasks seamlessly under 60 seconds if a worker process faces an abrupt `SIGKILL`.
- **Fault Tolerance Matrix:** Custom exponential retry backoffs ($2^{\text{attempts}}\text{ seconds}$) pushing permanently failing items to a Dead Letter Queue (DLQ) once `max_retries` are exhausted.

---

### How does your system mitigate resource exhaustion attacks (e.g., infinite loops) or clock drift across distributed servers?

**Answer:**

- **Infinite Loop Mitigation:** The worker configuration utilizes the native `timeout: 10000` option within `child_process.exec`. If a task command runs for more than 10 seconds without returning, the OS kernel intercepts it, fires a `SIGTERM` to kill the sub-shell process cleanly, and cycles the job back into the error-handling path without hanging the worker daemon.
- **Clock Drift Resolution:** To guarantee absolute sync across isolated processing loops, the system eliminates local system time calculations during queries. It delegates time checking directly to SQLite's internal engine using `STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')`, creating a single, atomic source of truth for visibility lock states across all parallel OS contexts.

## check out the video here:https://drive.google.com/file/d/1QGtEPuK8Gm_ReD0C83JiEnBuFxJNXfdi/view?usp=sharing
## ⚙️ Installation & Setup

### System Prerequisites

Ensure you are using **Node.js v22.11.0+** to gain native access to the built-in `node:sqlite` storage driver.

### Project Setup

Clone the repository workspace and make the primary CLI interface script executable:

```bash
git clone [https://github.com/SAMAD-KHAN03/flam_assignment](https://github.com/SAMAD-KHAN03/flam_assignment)
cd flam_assignment
sudo ln -s "$(pwd)/queuectl.js" /usr/local/bin/queuectl
queuectl help
