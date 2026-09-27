# Group Study — Cloudflare Worker & D1 Database Backend

This directory contains the production-ready Cloudflare Worker backend for **Group Study**, connected to Cloudflare D1 database `groupsstudydb` via binding `env.Db`.

## 1. Directory Structure

```text
backend/
├── package.json        # Dependencies and Wrangler scripts
├── tsconfig.json       # TypeScript configuration for Cloudflare Workers
├── wrangler.jsonc      # Modern Wrangler configuration with D1 database binding
├── wrangler.toml       # Legacy Wrangler configuration with D1 database binding
├── README.md           # This guide
└── src/
    └── index.ts        # Worker handler: CORS, /health, /api/chat, /api/memory
```

---

## 2. Cloudflare D1 Database Configuration

- **Database Name**: `groupsstudydb`
- **Worker Binding Variable**: `"Db"` (`env.Db`)
- **Table Schema**:
  ```sql
  CREATE TABLE memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```

---

## 3. Endpoints

### `GET /health`
Tests if the backend service is reachable and running.

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "Group Study"
}
```

### `POST /api/chat`
Accepts a JSON payload containing the user's message and returns the study assistant response.

**Request:**
```json
{
  "message": "Hello"
}
```

**Response (200 OK):**
```json
{
  "reply": "Hello! I'm Group Study. What are you studying today?"
}
```

### `POST /api/memory`
Saves a study memory note for a user into the D1 `memories` table using parameterized queries (`env.Db.prepare().bind().run()`).

**Request:**
```json
{
  "user_id": "nur",
  "content": "My favorite subject is ICT."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Memory saved."
}
```

**Validation:**
Returns `400 Bad Request` if `user_id` or `content` is missing or empty.

### `GET /api/memory?user_id=nur`
Retrieves all memories saved for the specified `user_id` using parameterized query (`env.Db.prepare().bind().all()`).

**Response (200 OK):**
```json
{
  "memories": [
    {
      "id": 1,
      "content": "My favorite subject is ICT.",
      "created_at": "2026-09-26 19:50:00"
    }
  ]
}
```

### `POST /api/memory/detect`
Stage 4A: Rule-based automatic memory detection. When the user sends a message, it detects obvious personal information (name, study, interests, favorites, location) in English and Bangla/Banglish, prevents duplicates via parameterized check (`SELECT id FROM memories WHERE user_id = ? AND content = ? LIMIT 1`), and saves to D1.

**Request:**
```json
{
  "user_id": "nur",
  "message": "My favorite subject is ICT."
}
```

**Response (200 OK - Detected):**
```json
{
  "detected": true,
  "memories": [
    {
      "content": "My favorite subject is ICT."
    }
  ]
}
```

**Response (200 OK - Nothing Detected):**
```json
{
  "detected": false,
  "memories": []
}
```

### `POST /api/memory/search`
Stage 4B: Relevant memory search using deterministic keyword matching, normalization, stop word removal, and relevance scoring (max 5 results).

**Request:**
```json
{
  "user_id": "nur",
  "query": "What is my favorite subject?"
}
```

**Response (200 OK):**
```json
{
  "memories": [
    {
      "id": 1,
      "content": "My favorite subject is ICT.",
      "created_at": "..."
    }
  ]
}
```

### `POST /api/memory/context`
Stage 4C: Memory Context Builder. Converts relevant memories into a clean, structured context string and object ready for future response generation.

**Request (via query):**
```json
{
  "user_id": "nur",
  "query": "What is my favorite subject?"
}
```

**Request (via direct memory array):**
```json
{
  "memories": [
    {
      "content": "My favorite subject is Bangla."
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "hasMemory": true,
  "memoryCount": 1,
  "context": "User Memory Context:\n- My favorite subject is Bangla."
}
```

**Response (when no memories found):**
```json
{
  "hasMemory": false,
  "memoryCount": 0,
  "context": "User Memory Context:\nNo relevant memories found."
}
```

### `POST /api/chat`
Stage 4D: AI-Powered Chat Endpoint.
The Worker searches relevant memories for the user, builds a grounded prompt, invokes the Gemini API server-side using the `GEMINI_API_KEY` secret, and returns the model-generated reply.

**Request:**
```json
{
  "message": "What is my favorite subject?",
  "user_id": "nur"
}
```

**Response (200 OK):**
```json
{
  "reply": "Your favorite subject is Bangla! How can I help you revise it today?",
  "context": "User Memory Context:\n- My favorite subject is Bangla."
}
```

**Response (503 Service Unavailable - if secret missing):**
```json
{
  "error": "GEMINI_API_KEY is not configured on the server."
}
```

---

## 4. How to Configure Secrets & Model (Stage 4D)

### Model Configuration Location
The default Gemini model identifier is maintained in a centralized configuration file:
- **Location:** `backend/src/config.ts`
- **Default constant:** `DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'`
- **Runtime override:** You can also override the model by setting the `GEMINI_MODEL` secret or environment variable.

### Production: Cloudflare Worker Secret
To set the `GEMINI_API_KEY` secret for your deployed Cloudflare Worker:
```bash
cd backend
npx wrangler secret put GEMINI_API_KEY
```
When prompted, paste your Google Gemini API key. Wrangler securely stores this secret in Cloudflare. It is never committed to Git.

### Local Development Secret
- For local Wrangler dev (`npx wrangler dev`), create a file named `backend/.dev.vars` (ignored by Git):
  ```ini
  GEMINI_API_KEY="your_actual_gemini_api_key_here"
  ```
- For the fullstack development server (`npm run dev`), define `GEMINI_API_KEY` in your environment or `.env.local`:
  ```ini
  GEMINI_API_KEY="your_actual_gemini_api_key_here"
  ```

---

## 5. How to Install Dependencies

From inside the `backend` folder:

```bash
cd backend
npm install
```

---

## 5. How to Run the Worker Locally

Start the local Cloudflare Workers emulator with Wrangler (supports local D1 emulation):

```bash
cd backend
npm run dev
# or: npx wrangler dev
```

Wrangler will start a local server at `http://localhost:8787`.

---

## 6. How to Test the Endpoints

### Testing with `curl`:

**1. Health Check:**
```bash
curl http://localhost:8787/health
```

**2. Chat Test ("hello"):**
```bash
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "hello"}'
```

**3. Save Memory Test:**
```bash
curl -X POST http://localhost:8787/api/memory \
  -H "Content-Type: application/json" \
  -d '{"user_id": "nur", "content": "My favorite subject is ICT."}'
```

**4. Retrieve Memories Test:**
```bash
curl "http://localhost:8787/api/memory?user_id=nur"
```

---

## 7. How to Deploy to Cloudflare Workers

1. Log in to your Cloudflare account via Wrangler (one-time):
   ```bash
   npx wrangler login
   ```
2. Verify or create your D1 database on Cloudflare (if not already created):
   ```bash
   npx wrangler d1 create groupsstudydb
   ```
3. Initialize the table on your Cloudflare D1 database:
   ```bash
   npx wrangler d1 execute groupsstudydb --command "CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, content TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);"
   ```
4. Deploy the Worker:
   ```bash
   npm run deploy
   # or: npx wrangler deploy
   ```
5. Wrangler will output your live URL, for example:
   `https://group-study-backend.<your-subdomain>.workers.dev`

---

## 8. Connecting Your Deployed Worker to the Frontend

Once deployed, provide the Worker URL to the Group Study frontend:

1. In your project root, open or create `.env.local` (or configure in your hosting environment):
   ```env
   VITE_API_URL="https://group-study-backend.<your-subdomain>.workers.dev"
   ```
2. Rebuild the frontend (`npm run build`). The frontend will automatically route all chat and memory requests to your live Cloudflare Worker!

