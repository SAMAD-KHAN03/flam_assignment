# Distributed Transactional Task Queue Engine (`queuectl`)

[cite_start]A production-grade, highly concurrent, distributed task execution queue built natively with **Node.js** and **SQLite**[cite: 6, 7, 13, 64]. [cite_start]This implementation requires **zero external npm dependencies** and relies entirely on built-in Node.js modules (`node:sqlite`, `node:child_process`, etc.)[cite: 43].

## 🎥 System Demo Recording

[cite_start][Click Here to Watch the Live Review Demo Video](YOUR*RECORDING_LINK_HERE) *(Replace this placeholder link with your short recording before submitting)\_ [cite: 99, 136]

---

## 🏗️ Architectural Overview

[cite_start]The engine operates on a shared-storage daemon cluster architecture[cite: 64, 66]. [cite_start]When multiple workers are spawned via the CLI, a Coordinator process isolates execution threads using `child_process.fork()`[cite: 66].

### High-Concurrency Safeguards

- [cite_start]**Atomic Dequeuing Locks:** Implements an exclusive `BEGIN IMMEDIATE` database transaction strategy[cite: 68]. [cite_start]This guarantees that no two workers can claim or execute the same job payload simultaneously across separate OS processes[cite: 67, 68].
- **Bare-Metal Boot Safety:** Leverages an inter-process lock mitigation backoff built using `SharedArrayBuffer` and `Atomics.wait()` to eliminate `database is locked` race conditions when processes spawn at the exact same millisecond.
- [cite_start]**Crash Safety Rule Implementation:** Queries for records left trapped in a `processing` state whose lock visibility windows (`locked_until`) have expired, rescuing tasks seamlessly under 60 seconds if a worker process faces an abrupt `SIGKILL`[cite: 35, 36, 37, 45].
- [cite_start]**Fault Tolerance Matrix:** Custom exponential retry backoffs ($2^{\text{attempts}}\text{ seconds}$) pushing permanently failing items to a Dead Letter Queue (DLQ) once `max_retries` are exhausted[cite: 16, 19, 57, 58, 61].

---

### How does your system mitigate resource exhaustion attacks (e.g., infinite loops) or clock drift across distributed servers?

**Answer:**

- **Infinite Loop Mitigation:** The worker configuration utilizes the native `timeout: 10000` option within `child_process.exec`. If a task command runs for more than 10 seconds without returning, the OS kernel intercepts it, fires a `SIGTERM` to kill the sub-shell process cleanly, and cycles the job back into the error-handling path without hanging the worker daemon.
- **Clock Drift Resolution:** To guarantee absolute sync across isolated processing loops, the system eliminates local system time calculations during queries. It delegates time checking directly to SQLite's internal engine using `STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')`, creating a single, atomic source of truth for visibility lock states across all parallel OS contexts.

## ⚙️ Installation & Setup

### System Prerequisites

Ensure you are using **Node.js v22.11.0+** to gain native access to the built-in `node:sqlite` storage driver.

### Project Setup

Clone the repository workspace and make the primary CLI interface script executable:

```bash
git clone https://github.com/SAMAD-KHAN03/flam_assignment
cd flam_assignment
sudo ln -s "$(pwd)/queuectl.js" /usr/local/bin/queuectl
queuectl help
```
