# High-Throughput Distributed Job Scheduler

A scalable job scheduler built with Node.js, Redis, and MySQL. It supports thousands of job executions per second with high accuracy, minimal drift, and "at-least-once" execution semantics.

## 🏗 System Design

### Architecture
The system follows a **Producer-Consumer** pattern decoupled by a high-speed message broker (Redis).
1.  **API Layer (Producer):** Accepts job specifications, validates cron strings, persists definitions to MySQL, and adds the initial run time to the Redis Sorted Set.
2.  **Dispatcher (Scheduler):** A high-performance polling service. It queries the Redis Sorted Set (`ZSET`) for jobs where `score <= now`. It pushes due jobs to the Execution Queue and immediately calculates/updates the *next* run time to ensure schedule accuracy.
3.  **Worker Pool (Consumer):** Stateless workers that block-pop jobs from the Execution Queue. They perform the HTTP requests and log the full execution history (status, duration, response) to MySQL.
```mermaid
graph TD
    User[User / Client] -->|HTTP POST /jobs| API[API Server]
    API -->|1. Store Job| DB[(MySQL Database)]
    API -->|2. Initial Schedule| Redis[(Redis ZSET)]
    
    subgraph Scheduling_Loop [Dispatcher Service]
        Dispatcher -->|3. Poll Due Jobs| Redis
        Redis -->|4. Push to Queue| Queue[(Redis List)]
        Dispatcher -->|5. Recalculate Next Run| Redis
    end
    
    subgraph Execution_Layer [Worker Service]
        Worker -->|6. Pop Job| Queue
        Worker -->|7. Fetch Details| DB
        Worker -->|8. HTTP Request| ExternalAPI[External API]
        Worker -->|9. Log Result| DB
        Worker -->|10. Alert on Fail| Alert[Alert System]
    end

    classDef distinct fill:#f9f,stroke:#333,stroke-width:2px;
    class Redis,DB distinct;

### Trade-offs
* **Redis vs. In-Memory:** We chose Redis over local `setTimeout` to ensure persistence across restarts and to allow multiple dispatcher/worker nodes to coordinate without race conditions.
* **MySQL vs. NoSQL:** MySQL was chosen for the structured relationship between `Jobs` and `Executions`, ensuring data integrity for job configurations.
* **Drift Minimization:** By decoupling scheduling (Dispatcher) from execution (Worker), long-running HTTP tasks do not block the scheduler, ensuring minimal drift.

---

## 🔄 Data Flow

1.  **Creation:** User POSTs job -> API parses Cron -> Inserts into MySQL -> `ZADD` into Redis (Score = Next Timestamp).
2.  **Dispatch:** Dispatcher `ZRANGEBYSCORE` (0 to NOW) -> `RPUSH` to Queue -> `ZADD` new Score (Next Run).
3.  **Execution:** Worker `BLPOP` -> `SELECT` API URL -> `axios.post()` -> `INSERT` History -> Alert if failed.

---

## 🔌 API Design

### 1. Create Job
* **Endpoint:** `POST /jobs`
* **Payload:**
    ```json
    {
      "schedule": "*/5 * * * * *",
      "api": "[https://httpbin.org/post](https://httpbin.org/post)",
      "type": "ATLEAST_ONCE"
    }
    ```
* **Response:** `200 OK` `{ "jobId": 1, "nextRun": "..." }`

### 2. Get Job Executions
* **Endpoint:** `GET /jobs/:id/executions`
* **Response:** List of last 5 runs including status, duration (ms), and timestamps.

### 3. Modify Job
* **Endpoint:** `PUT /jobs/:id`
* **Payload:** `{ "schedule": "...", "api": "..." }`

### 4. System Observability
* **Endpoint:** `GET /stats`
* **Response:** Real-time metrics on Queue Depth, Active Schedules, and DB Health.

---

## 🚀 Setup & Run

1.  **Prerequisites:** Node.js, MySQL, Redis.
2.  **Install:** `npm install`
3.  **Setup DB:** `npm run setup` (Creates tables automatically)
4.  **Run Services:**
    * Terminal 1: `node src/server.js`
    * Terminal 2: `node src/dispatcher.js`
    * Terminal 3: `node src/worker.js`

##🧪 Testing Guide

----------------



Here is how to verify the system works using curl.



### Test 1: Schedule a High-Frequency Job (Every 5s)



**Input:**



Bash



Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   curl -X POST http://localhost:3000/jobs \       -H "Content-Type: application/json" \       -d '{             "schedule": "*/5 * * * * *",             "api": "[https://httpbin.org/post](https://httpbin.org/post)"           }'   `



**Expected Output (Worker Terminal):**You should see this log appear every 5 seconds:



Plaintext



Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   ⚡ [Worker] Executing Job 1 -> [https://httpbin.org/post](https://httpbin.org/post)   `



### Test 2: Verify Execution History



**Input:**Wait 15 seconds, then run:



Bash



Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   curl http://localhost:3000/jobs/1/executions   `



**Expected Output:**A JSON array of recent runs with HTTP 200 status:



JSON



Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   [    { "id": 5, "status": 200, "duration_ms": 450, ... },    { "id": 4, "status": 200, "duration_ms": 410, ... }  ]   `



### Test 3: Test Alert System (Fault Tolerance)



**Input:**Create a job with an invalid API URL.



Bash



Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   curl -X POST http://localhost:3000/jobs \       -H "Content-Type: application/json" \       -d '{             "schedule": "*/3 * * * * *",             "api": "[http://invalid-url-test.local/api](http://invalid-url-test.local/api)"           }'   `



**Expected Output (Worker Terminal):**The worker should catch the error and trigger the alert system.



Plaintext



Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   🚨 [ALERT SYSTEM] Job 2 Failed Critically!     Reason: getaddrinfo ENOTFOUND invalid-url-test.local     Action: Alert sent to admin dashboard.   `



### Test 4: Check System Health (Observability)



**Input:**



Bash



Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   curl http://localhost:3000/stats   `



**Expected Output:**



JSON



Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "status": "Operational",    "metrics": {      "jobs_waiting_in_queue": 0,      "total_active_schedules": 2,      "database_status": "Connected"    }  }   `