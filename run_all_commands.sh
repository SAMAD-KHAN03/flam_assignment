#!/bin/bash
#!/usr/bin/env  --experimental-sqlite

echo "===================================================="
echo "🚀 EXECUTING COMPLETE QUEUE SYSTEM CLI DEMO SCRIPT"
echo "===================================================="

# 1. Start a pool of background processes 
echo -e "\n1️⃣ Spawning a parallel worker pool..."
queuectl worker start count 3 &
WORKER_PID=$! # Save bash background tracker ref
sleep 2 # Let workers complete microsecond boot backoffs

# 2. Enqueue multiple test case scenarios
echo -e "\n2️⃣ Ingesting experimental job configurations..."
 queuectl enqueue '{"id": "happy-path-1", "command": "echo \"Hello from Job 1\" && sleep 1"}'
 queuectl enqueue '{"id": "happy-path-2", "command": "echo \"Hello from Job 2\""}'
 queuectl enqueue '{"id": "flaky-job-demo", "command": "exit 1", "max_retries": 2}'

sleep 2 # Give system processes time to handle happy paths

# 3. Check System Monitoring Metrics Dashboard
echo -e "\n3️⃣ Checking real-time aggregate metrics status..."
 queuectl status

# 4. Print Tabular Database Inventory Listing
echo -e "\n4️⃣ Displaying active data table columns inventory..."
 queuectl list

# 5. Review Dead Letter Queue Logs
echo -e "\n5️⃣ Inspecting the Dead Letter Queue storage layer..."
 queuectl dlq list

# 6. Rescue Stranded Tasks from the Dead Status Layer
echo -e "\n6️⃣ Rescuing isolated dead item records..."
 queuectl dlq retry flaky-job-demo

sleep 2 # Let rescued jobs execute

# 7. Graceful Multi-Daemon Tear Down Sequence
echo -e "\n7️⃣ Issuing cross-process termination signals..."
 queuectl worker stop

echo -e "\n===================================================="
echo "✅ ALL INTERFACE UTILITIES EXECUTED SUCCESSFULLY"
echo "===================================================="