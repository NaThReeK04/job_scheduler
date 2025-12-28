const express = require('express');
const { CronExpressionParser } = require("cron-parser");
const { db, redisClient, connectRedis, KEYS } = require('./config/db');

const app = express();
app.use(express.json());

// API 1: Create a Job
app.post('/jobs', async (req, res) => {
    const { schedule, api } = req.body;

    if (!schedule || !api) return res.status(400).send("Missing schedule or api");

    try {
        const interval = CronExpressionParser.parse(schedule);
        const nextRun = interval.next().toDate();

        const [result] = await db.execute(
            'INSERT INTO jobs (schedule, api_url) VALUES (?, ?)',
            [schedule, api]
        );
        const jobId = result.insertId;
        await redisClient.zAdd(KEYS.SCHEDULE_ZSET, {
            score: nextRun.getTime(),
            value: jobId.toString()
        });

        res.json({ success: true, jobId, nextRun });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API 2: Get Job History
app.get('/jobs/:id/executions', async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM job_executions WHERE job_id = ? ORDER BY start_time DESC LIMIT 5',
            [req.params.id]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API 3: Modify an existing Job
app.put('/jobs/:id', async (req, res) => {
    const { id } = req.params;
    const { schedule, api } = req.body;

    if (!schedule || !api) return res.status(400).send("Missing schedule or api");

    try {
        const interval = CronExpressionParser.parse(schedule);
        const nextRun = interval.next().toDate();
        const [result] = await db.execute(
            'UPDATE jobs SET schedule = ?, api_url = ? WHERE id = ?',
            [schedule, api, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Job not found" });
        }
        await redisClient.zAdd(KEYS.SCHEDULE_ZSET, {
            score: nextRun.getTime(),
            value: id.toString()
        });

        res.json({ success: true, message: "Job updated", nextRun });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// API 4: Observability & Metrics (The Missing Piece)
app.get('/stats', async (req, res) => {
    try {
        const queueLength = await redisClient.lLen(KEYS.EXECUTION_QUEUE);
        const scheduledCount = await redisClient.zCard(KEYS.SCHEDULE_ZSET);
        
        const [dbResult] = await db.execute('SELECT 1');
        const dbStatus = dbResult.length > 0 ? 'Connected' : 'Error';

        res.json({
            status: 'Operational',
            timestamp: new Date(),
            metrics: {
                jobs_waiting_in_queue: queueLength, 
                total_active_schedules: scheduledCount,
                database_status: dbStatus
            }
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'Degraded', 
            error: error.message 
        });
    }
});

// ... app.listen ...
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    await connectRedis();
    console.log(`🚀 API Server running on port ${PORT}`);
});