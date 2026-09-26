# Group Study — Stage 2: Cloudflare Worker Backend

This directory contains the production-ready Cloudflare Worker backend for **Group Study**.

## 1. Directory Structure

```text
backend/
├── package.json        # Dependencies and Wrangler scripts
├── tsconfig.json       # TypeScript configuration for Cloudflare Workers
├── wrangler.jsonc      # Modern Wrangler configuration
├── wrangler.toml       # Legacy Wrangler configuration compatibility
├── README.md           # This guide
└── src/
    └── index.ts        # Worker handler: CORS, GET /health, POST /api/chat
```

---

## 2. Endpoints

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

**Response Rules:**
- If message is or starts with `"hello"`, `"hi"`, or `"hey"`:
  `"Hello! I'm Group Study. What are you studying today?"`
- If message contains `"photosynthesis"`:
  `"Photosynthesis is the process by which green plants use sunlight, water and carbon dioxide to produce food and oxygen."`
- For any other message:
  `"I received your message. The real AI will be connected in a later stage."`
- If the `"message"` field is missing:
  `400 Bad Request` with `{ "error": "The \"message\" field is required and must be a non-empty string." }`

---

## 3. How to Install Dependencies

From inside the `backend` folder:

```bash
cd backend
npm install
```

---

## 4. How to Run the Worker Locally

Start the local Cloudflare Workers emulator with Wrangler:

```bash
cd backend
npm run dev
# or: npx wrangler dev
```

Wrangler will start a local server at `http://localhost:8787`.

---

## 5. How to Test the Endpoints

### Testing with `curl`:

**Health Check:**
```bash
curl http://localhost:8787/health
```

**Chat Test ("hello"):**
```bash
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "hello"}'
```

**Chat Test ("photosynthesis"):**
```bash
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is photosynthesis?"}'
```

**Chat Test (Other message):**
```bash
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me about Newton"}'
```

---

## 6. How to Deploy to Cloudflare Workers

1. Log in to your Cloudflare account via Wrangler (one-time):
   ```bash
   npx wrangler login
   ```
2. Deploy the Worker:
   ```bash
   npm run deploy
   # or: npx wrangler deploy
   ```
3. Wrangler will output your live URL, for example:
   `https://group-study-backend.<your-subdomain>.workers.dev`

---

## 7. Connecting Your Deployed Worker to the Frontend

Once deployed, provide the Worker URL to the Group Study frontend:

1. In your project root, open or create `.env.local` (or configure in your hosting environment):
   ```env
   VITE_API_URL="https://group-study-backend.<your-subdomain>.workers.dev"
   ```
2. Rebuild the frontend (`npm run build`). The frontend will automatically route all chat requests to your live Cloudflare Worker!

### CORS in Production

By default, the Worker accepts requests from any origin (`*`) during prototyping. To restrict CORS to your production frontend domain:

In `backend/wrangler.toml`:
```toml
[vars]
FRONTEND_ORIGIN = "https://your-group-study-frontend-domain.com"
```
Or in `backend/wrangler.jsonc`:
```jsonc
{
  "vars": {
    "FRONTEND_ORIGIN": "https://your-group-study-frontend-domain.com"
  }
}
```
Deploy the update: `npx wrangler deploy`.
