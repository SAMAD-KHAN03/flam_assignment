# Design Decisions & Technical Defense Guide

This document defends the distributed architecture, concurrency primitives, and transactional strategies implemented in the `queuectl` system.

---

### 1. Which exact line(s) prevent two workers from claiming the same job, and why is that operation atomic across separate OS processes?

**Answer:**
The atomicity is achieved inside `utilities/worker.js` within the `claimTransaction` function wrapper using these exact lines:
```javascript
db.exec("BEGIN IMMEDIATE;");