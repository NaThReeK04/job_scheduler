# High-Throughput Distributed Job Scheduler

A scalable job scheduler built with **Node.js, Redis, and MySQL**.  
It supports thousands of job executions per second with high accuracy, minimal drift, and **at-least-once** execution semantics.

---

## 🏗 System Design

### Architecture

The system follows a **Producer–Consumer** pattern decoupled by a high-speed message broker (**Redis**).

- **API Layer (Producer)**  
  Accepts job specifications, validates cron strings, persists definitions to MySQL, and adds the initial run time to the Redis Sorted Set.

- **Dispatcher (Scheduler)**  
  A high-performance polling service. It queries the Redis Sorted Set (`ZSET`) for jobs where `score <= now`, pushes due jobs to the execution queue, and immediately recalculates the next run time to ensure schedule accuracy.

- **Worker Pool (Consumer)**  
  Stateless workers that block-pop jobs from the execution queue, perform HTTP requests, and log execution history (status, duration, response) to MySQL.

---

## 📊 Architecture Diagram

```mermaid
graph TD
    User[User / Client] -->|HTTP POST /jobs| API[API Server]
    API -->|Store Job| DB[(MySQL Database)]
    API -->|Initial Schedule| Redis[(Redis ZSET)]

    subgraph Dispatcher_Service
        Dispatcher -->|Poll Due Jobs| Redis
        Dispatcher -->|Push to Queue| Queue[(Redis List)]
        Dispatcher -->|Recalculate Next Run| Redis
    end

    subgraph Worker_Service
        Worker -->|Pop Job| Queue
        Worker -->|Fetch Details| DB
        Worker -->|HTTP Request| ExternalAPI[External API]
        Worker -->|Log Result| DB
        Worker -->|Alert on Failure| Alert[Alert System]
    end
## ⚖ Trade-offs

### Redis vs In-Memory
Redis ensures persistence across restarts and enables horizontal scaling without race conditions.

### MySQL vs NoSQL
MySQL enforces strong relational integrity between **Jobs** and **Executions**.

### Drift Minimization
Decoupling scheduling (**Dispatcher**) from execution (**Worker**) prevents long-running jobs from delaying future schedules.

---

## 🔄 Data Flow

### Creation
User POSTs job → API parses cron → Inserts into MySQL → `ZADD` into Redis (score = next timestamp)

### Dispatch
Dispatcher `ZRANGEBYSCORE (0 → now)` → `RPUSH` to queue → `ZADD` next run time

### Execution
Worker `BLPOP` → HTTP call → `INSERT` execution history → alert on failure

---

## 🔌 API Design

### 1. Create Job

- **Endpoint:** `POST /jobs`

```json
{
  "schedule": "*/5 * * * * *",
  "api": "https://httpbin.org/post",
  "type": "ATLEAST_ONCE"
}
**Response**
```json
{
  "jobId": 1,
  "nextRun": "2025-12-27T07:20:00Z"
}
### 2. Get Job Executions

- **Endpoint:** `GET /jobs/:id/executions`

Returns the last 5 executions with status, duration, and timestamps.

---

### 3. Modify Job

- **Endpoint:** `PUT /jobs/:id`

```json
{
  "schedule": "*/10 * * * * *",
  "api": "https://example.com/api"
}
### 4. System Observability

- **Endpoint:** `GET /stats`

```json
{
  "status": "Operational",
  "metrics": {
    "jobs_waiting_in_queue": 0,
    "total_active_schedules": 2,
    "database_status": "Connected"
  }
}
## 🚀 Setup & Run

### Prerequisites
- Node.js
- MySQL
- Redis

### Installation
```bash
npm install
### Database Setup

```bash
npm run setup
## Run Services

```bash
node src/server.js
node src/dispatcher.js
node src/worker.js
## 🧪 Testing Guide

### Test 1: Schedule a High-Frequency Job (Every 5s)

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "schedule": "*/5 * * * * *",
    "api": "https://httpbin.org/post"
  }'
### Test 2: Verify Execution History

```bash
curl http://localhost:3000/jobs/1/executions
```json
[
  { "id": 5, "status": 200, "duration_ms": 450 },
  { "id": 4, "status": 200, "duration_ms": 410 }
]
### Test 3: Alert System (Fault Tolerance)

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "schedule": "*/3 * * * * *",
    "api": "http://invalid-url-test.local/api"
  }'

### Test 4: System Health Check

```bash
curl http://localhost:3000/stats

```json
{
  "status": "Operational",
  "metrics": {
    "jobs_waiting_in_queue": 0,
    "total_active_schedules": 2,
    "database_status": "Connected"
  }
}