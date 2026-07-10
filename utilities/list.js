


function handleList(args) {
  const stateIndex = args.indexOf('--state');
  const targetState = stateIndex !== -1 ? args[stateIndex + 1] : null;
  const isJson = args.includes('--json');

  console.log(`[CLI] List command triggered for state: ${targetState}`);
  // TODO: Fetch matching jobs from SQLite 
  // CRITICAL: If --json is passed, print ONLY the raw JSON array to stdout 
}

module.exports = handleList;