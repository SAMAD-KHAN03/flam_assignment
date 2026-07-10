
function handleEnqueue(args) {
  const jsonPayload = args[0];
  console.log(`[CLI] Enqueue command triggered.`);
  console.log(`[CLI] Received Payload String: ${jsonPayload}`);
  // TODO: Parse JSON, save to SQLite with state='pending' 
}

module.exports=handleEnqueue;