const handleEnqueue = require("../utilities/enqueue");
const handleWorker = require("../utilities/worker");
const handleStatus = require("../utilities/status");
const handleList = require("../utilities/list");
const handleDlq = require("../utilities/dlq");
const handleConfig = require("../utilities/config");
const handleHelp = require("../utilities/help"); // Import the help manual

function handleCommands(argv) {
  const command = argv[2];
  const subArgs = argv.slice(3);

  switch (command) {
    case "enqueue":
      handleEnqueue(subArgs);
      break;

    case "worker":
      handleWorker(subArgs);
      break;

    case "_child_internal":
      handleWorker(["_child_internal"]);
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

    case "help":
    case "--help":
    case "-h":
      handleHelp();
      break;

    default:
      console.log(`⚠️  Unknown command: "${command || ''}"`);
      handleHelp(); // Fall back to printing the guide safely
  }
}

module.exports = handleCommands;