// src/config/db.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const { createClient } = require('redis');

// MySQL Connection Pool
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Redis Client
const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.on('error', (err) => console.log('Redis Client Error', err));

async function connectRedis() {
    if (!redisClient.isOpen) {
        await redisClient.connect();
        console.log('✅ Redis Connected');
    }
}

// Redis Keys Constants
const KEYS = {
    SCHEDULE_ZSET: 'scheduler:delayed_jobs', 
    EXECUTION_QUEUE: 'scheduler:execution_queue' 
};

module.exports = { db, redisClient, connectRedis, KEYS };