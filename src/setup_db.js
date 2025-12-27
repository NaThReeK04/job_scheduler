// setup_db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function setupDatabase() {
    console.log("🔄 Starting Database Setup...");

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
    });

    try {
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
        console.log(`✅ Database '${process.env.DB_NAME}' created or already exists.`);

        await connection.changeUser({ database: process.env.DB_NAME });

        // 4. Create 'jobs' Table
        const createJobsTable = `
            CREATE TABLE IF NOT EXISTS jobs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                schedule VARCHAR(255) NOT NULL,
                api_url TEXT NOT NULL,
                type VARCHAR(50) DEFAULT 'ATLEAST_ONCE',
                status VARCHAR(20) DEFAULT 'ACTIVE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await connection.query(createJobsTable);
        console.log("✅ Table 'jobs' is ready.");

        // 5. Create 'job_executions' Table
        const createExecutionsTable = `
            CREATE TABLE IF NOT EXISTS job_executions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_id INT,
                status INT,
                start_time DATETIME(3),
                end_time DATETIME(3),
                duration_ms INT,
                response_body TEXT,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
            )
        `;
        await connection.query(createExecutionsTable);
        console.log("✅ Table 'job_executions' is ready.");

        console.log("🚀 Database setup completed successfully!");

    } catch (error) {
        console.error("❌ Error setting up database:", error.message);
    } finally {
        await connection.end();
    }
}

setupDatabase();