// 1. Import handlers from the modular files
const  handleEnqueue  = require("../utilities/enqueue");
const  handleWorker  = require("../utilities/worker");
const  handleStatus  = require("../utilities/status");
const  handleList  = require("../utilities/list");
const  handleDlq  = require("../utilities/dlq");
const  handleConfig  = require("../utilities/config");
function handleCommands(argv) {
  // 1. Capture the primary command from the terminal arguments
  // Example: in 'node queuectl.js worker start', command is 'worker'
  const command = argv[2];
  const subArgs = argv.slice(3);

  switch (command) {
    case "enqueue":
      handleEnqueue(subArgs);
      break;

    case "worker":
      handleWorker(subArgs);
      break;

    case "status":
      handleStatus();
      break;

    case "list":
      handleList(subArgs);
      break;

    case "dlq":
      handleDlq(subArgs);
      break;

    case "config":
      handleConfig(subArgs);
      break;

    default:
      printHelp();
      process.exit(1);
  }
}
module.exports = handleCommands;
