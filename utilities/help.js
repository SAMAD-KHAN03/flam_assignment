

function printHelp() {
  console.log(`
QueueCTL - Background Job Queue CLI 
Available Commands:
  node queuectl.js enqueue '<json_string>'
  node queuectl.js worker start count <n>
  node queuectl.js worker stop
  node queuectl.js status
  node queuectl.js list --state <state_name> [--json]
  node queuectl.js dlq list
  node queuectl.js dlq retry <job_id>
  node queuectl.js config set <key> <value>
  `);
}
module.exports = printHelp;