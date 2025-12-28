// src/dispatcher.js
const parser = require("cron-parser");
const { db, redisClient, connectRedis, KEYS } = require('./config/db');

// HA Constants
const LEADER_KEY = 'scheduler:leader';
const LEADER_TTL = 5; // seconds
const ID = Math.random().toString(36).substring(7); // Unique ID for this instance

async function acquireLeaderLock() {
    try {
        // Try to set the key ONLY if it doesn't exist (NX) with an expiry (EX)
        const result = await redisClient.set(LEADER_KEY, ID, {
            NX: true,
            EX: LEADER_TTL
        });
        return result === 'OK';
    } catch (e) {
        return false;
    }
}

async function extendLeaderLock() {
    try {
        const currentLeader = await redisClient.get(LEADER_KEY);
        if (currentLeader === ID) {
            await redisClient.expire(LEADER_KEY, LEADER_TTL);
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function processSchedule() {
    const now = Date.now();
    const dueJobs = await redisClient.zRangeByScore(KEYS.SCHEDULE_ZSET, 0, now, { LIMIT: { offset: 0, count: 50 } });

    for (const jobId of dueJobs) {
        const [rows] = await db.execute('SELECT schedule FROM jobs WHERE id = ?', [jobId]);
        
        if (rows.length === 0) {
            await redisClient.zRem(KEYS.SCHEDULE_ZSET, jobId);
            continue;
        }

        // --- ATOMICITY CHECK ---
        // Verify the job is still due (race condition protection)
        const currentScore = await redisClient.zScore(KEYS.SCHEDULE_ZSET, jobId);
        if (!currentScore || currentScore > now) continue; 
        // -----------------------

        const scheduleStr = rows[0].schedule;
        const payload = JSON.stringify({ jobId, scheduledFor: now });
        
        await redisClient.rPush(KEYS.EXECUTION_QUEUE, payload);

        try {
            const interval = CronExpressionParser.parse(schedule);
            const nextRun = interval.next().toDate().getTime();
            await redisClient.zAdd(KEYS.SCHEDULE_ZSET, { score: nextRun, value: jobId });
            console.log(`[${ID}] Scheduled Job ${jobId} for next run.`);
        } catch (e) {
            await redisClient.zRem(KEYS.SCHEDULE_ZSET, jobId);
        }
    }
}

async function startDispatcher() {
    await connectRedis();
    console.log(`🔄 Dispatcher Instance [${ID}] Started...`);

    while (true) {
        // 1. Try to become leader or extend leadership
        let isLeader = await extendLeaderLock();
        if (!isLeader) {
            isLeader = await acquireLeaderLock();
        }

        if (isLeader) {
            // I am the leader, I do the work
            // process.stdout.write(`.`); // Heartbeat
            await processSchedule();
        } else {
            // I am standby, I wait for leader to fail
            // console.log(`[${ID}] Standby...`);
        }

        // Sleep briefly
        await new Promise(r => setTimeout(r, 500));
    }
}

startDispatcher();