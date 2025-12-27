const parser = require('cron-parser');
const { db, redisClient, connectRedis, KEYS } = require('./config/db');

async function processSchedule() {
    const now = Date.now();

   
    const dueJobs = await redisClient.zRangeByScore(KEYS.SCHEDULE_ZSET, 0, now, { LIMIT: { offset: 0, count: 50 } });

    if (dueJobs.length > 0) {
        console.log(`⏰ Dispatcher found ${dueJobs.length} due jobs.`);
    }

    for (const jobId of dueJobs) {
        const [rows] = await db.execute('SELECT schedule FROM jobs WHERE id = ?', [jobId]);
        
        if (rows.length === 0) {
            await redisClient.zRem(KEYS.SCHEDULE_ZSET, jobId);
            continue;
        }

        const scheduleStr = rows[0].schedule;

        const payload = JSON.stringify({ jobId, scheduledFor: now });
        await redisClient.rPush(KEYS.EXECUTION_QUEUE, payload);

        try {
            const interval = parser.parseExpression(scheduleStr);
            const nextRun = interval.next().toDate().getTime();
            
            await redisClient.zAdd(KEYS.SCHEDULE_ZSET, { score: nextRun, value: jobId });
        } catch (e) {
            console.log(`Job ${jobId} completed.`);
            await redisClient.zRem(KEYS.SCHEDULE_ZSET, jobId);
        }
    }
}

async function startDispatcher() {
    await connectRedis();
    console.log("🔄 Dispatcher Service Started...");

    while (true) {
        await processSchedule();
        await new Promise(r => setTimeout(r, 500));
    }
}

startDispatcher();