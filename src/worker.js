// src/worker.js
const axios = require('axios');
const { db, redisClient, connectRedis, KEYS } = require('./config/db');

function sendAlert(jobId, errorMsg) {
    console.error(`\n🚨 [ALERT SYSTEM] Job ${jobId} Failed Critically!`);
    console.error(`   Reason: ${errorMsg}`);
    console.error(`   Timestamp: ${new Date().toISOString()}`);
    console.error(`   Action: Alert sent to admin dashboard.\n`);
}

async function executeJob(payloadStr) {
    const { jobId, scheduledFor } = JSON.parse(payloadStr);

    // 1. Fetch API URL
    const [rows] = await db.execute('SELECT api_url FROM jobs WHERE id = ?', [jobId]);
    if (rows.length === 0) return;
    const { api_url } = rows[0];

    console.log(`⚡ [Worker] Executing Job ${jobId} -> ${api_url}`);

    const startTime = new Date();
    let status = 200;
    let responseBody = '';
    let errorMsg = null;

    // 2. Make the HTTP Request
    try {
        const response = await axios.post(api_url, { 
            scheduled_time: scheduledFor, 
            execution_time: startTime.getTime() 
        });
        status = response.status;
        responseBody = JSON.stringify(response.data).substring(0, 1000); 
    } catch (error) {
        status = error.response ? error.response.status : 500;
        errorMsg = error.message;

        sendAlert(jobId, errorMsg);
    }

    const endTime = new Date();
    const duration = endTime - startTime;

    // 3. Log History to MySQL
    try {
        await db.execute(
            `INSERT INTO job_executions 
            (job_id, status, start_time, end_time, duration_ms, response_body, error_message) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [jobId, status, startTime, endTime, duration, responseBody, errorMsg]
        );
    } catch (e) {
        console.error("DB Error:", e);
    }
}

async function startWorker() {
    await connectRedis();
    console.log("👷 Worker Service Started...");

    while (true) {
        const result = await redisClient.blPop(KEYS.EXECUTION_QUEUE, 0);
        if (result) {
            await executeJob(result.element);
        }
    }
}

startWorker();