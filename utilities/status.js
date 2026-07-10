

function handleStatus() {
  console.log(`[CLI] Status command triggered.`);
  console.log(`[CLI] Summarizing all job states & active workers...`);
  // TODO: Run SELECT COUNT(*) GROUP BY state queries on SQLite 
}

module.exports=handleStatus;