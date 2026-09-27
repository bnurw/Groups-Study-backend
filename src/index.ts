import { detectMemoriesFromMessage } from './detect';
import { rankMemories } from './search';
import { buildMemoryContext } from './context';
import { buildChatPrompt } from './prompt';
import { callGemini } from './gemini';
import { DEFAULT_GEMINI_MODEL } from './config';

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[]; success: boolean }>;
  run(): Promise<{ success: boolean; meta?: unknown }>;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface Env {
  // Required D1 database binding
  Db: D1Database;
  // Optional frontend origin for strict CORS in production
  FRONTEND_ORIGIN?: string;
  // Stage 4D: Gemini API Secret Key
  GEMINI_API_KEY?: string;
  // Stage 4D: Configurable Gemini Model
  GEMINI_MODEL?: string;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: Env, ctx?: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // CORS configuration:
    // If FRONTEND_ORIGIN is specified in wrangler.toml or environment, use it.
    // Otherwise reflect incoming request origin (or '*' fallback) to allow seamless development.
    const allowedOrigin = env.FRONTEND_ORIGIN || origin || '*';

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };

    // 1. Handle CORS Preflight OPTIONS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      // 2. Health Check: GET /health
      if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
        const healthPayload = {
          status: 'ok',
          service: 'Group Study',
        };

        return new Response(JSON.stringify(healthPayload), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }

      // 3. Stage 3D: Save Memory - POST /api/memory
      if (request.method === 'POST' && url.pathname === '/api/memory') {
        let body: any;

        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: 'Invalid JSON request body' }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        const userId = body?.user_id;
        const content = body?.content;

        if (
          typeof userId !== 'string' ||
          !userId.trim() ||
          typeof content !== 'string' ||
          !content.trim()
        ) {
          return new Response(
            JSON.stringify({
              error: 'Both "user_id" and "content" are required and must be non-empty strings.',
            }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        // Parameterized query using env.Db
        await env.Db.prepare(
          'INSERT INTO memories (user_id, content) VALUES (?, ?)'
        )
          .bind(userId.trim(), content.trim())
          .run();

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Memory saved.',
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }

      // 4. Stage 3D: Retrieve Memories - GET /api/memory?user_id=nur
      if (request.method === 'GET' && url.pathname === '/api/memory') {
        const userId = url.searchParams.get('user_id');

        if (!userId || !userId.trim()) {
          return new Response(
            JSON.stringify({
              error: 'The "user_id" query parameter is required.',
            }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        // Parameterized query using env.Db
        const { results } = await env.Db.prepare(
          'SELECT id, content, created_at FROM memories WHERE user_id = ? ORDER BY id DESC'
        )
          .bind(userId.trim())
          .all<{ id: number; content: string; created_at: string }>();

        return new Response(
          JSON.stringify({
            memories: results || [],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }

      // 5. Stage 4A: Automatic Memory Detection - POST /api/memory/detect
      if (request.method === 'POST' && url.pathname === '/api/memory/detect') {
        let body: any;

        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: 'Invalid JSON request body' }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        const userId = body?.user_id;
        const message = body?.message;

        if (
          typeof userId !== 'string' ||
          !userId.trim() ||
          typeof message !== 'string' ||
          !message.trim()
        ) {
          return new Response(
            JSON.stringify({
              error: 'Both "user_id" and "message" are required and must be non-empty strings.',
            }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        const detected = detectMemoriesFromMessage(message);

        if (detected.length === 0) {
          return new Response(
            JSON.stringify({
              detected: false,
              memories: [],
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        // Avoid duplicate memories: check whether the same user already has the exact same content
        for (const mem of detected) {
          const existing = await env.Db.prepare(
            'SELECT id FROM memories WHERE user_id = ? AND content = ? LIMIT 1'
          )
            .bind(userId.trim(), mem.content.trim())
            .first();

          if (!existing) {
            await env.Db.prepare(
              'INSERT INTO memories (user_id, content) VALUES (?, ?)'
            )
              .bind(userId.trim(), mem.content.trim())
              .run();
          }
        }

        return new Response(
          JSON.stringify({
            detected: true,
            memories: detected.map((m) => ({ content: m.content })),
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }

      // 6. Stage 4B: Relevant Memory Search - POST /api/memory/search
      if (request.method === 'POST' && url.pathname === '/api/memory/search') {
        let body: any;

        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: 'Invalid JSON request body' }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        const userId = body?.user_id;
        const query = body?.query;

        if (typeof userId !== 'string' || !userId.trim()) {
          return new Response(
            JSON.stringify({
              error: 'The "user_id" field is required and must be a non-empty string.',
            }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        if (typeof query !== 'string' || !query.trim()) {
          return new Response(
            JSON.stringify({
              memories: [],
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        // Parameterized query using env.Db to retrieve user's memories
        const { results } = await env.Db.prepare(
          'SELECT id, content, created_at FROM memories WHERE user_id = ? ORDER BY id DESC'
        )
          .bind(userId.trim())
          .all<{ id: number; content: string; created_at: string }>();

        // Rank memories using keyword relevance (limit top 5)
        const relevant = rankMemories(results || [], query.trim(), 5);

        return new Response(
          JSON.stringify({
            memories: relevant,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }

      // 7. Stage 4C: Memory Context Builder - POST /api/memory/context
      if (request.method === 'POST' && url.pathname === '/api/memory/context') {
        let body: any;

        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: 'Invalid JSON request body' }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        // Mode A: Context directly from pre-provided memories array
        if (Array.isArray(body?.memories)) {
          const result = buildMemoryContext(body.memories);
          return new Response(
            JSON.stringify(result),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        // Mode B: Retrieve memories by user_id and query
        const userId = body?.user_id;
        const query = body?.query;

        if (typeof userId !== 'string' || !userId.trim()) {
          return new Response(
            JSON.stringify({
              error: 'Either "memories" array or "user_id" must be provided.',
            }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        if (typeof query !== 'string' || !query.trim()) {
          const result = buildMemoryContext([]);
          return new Response(
            JSON.stringify(result),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        // Fetch user's memories using parameterized query
        const { results } = await env.Db.prepare(
          'SELECT id, content, created_at FROM memories WHERE user_id = ? ORDER BY id DESC'
        )
          .bind(userId.trim())
          .all<{ id: number; content: string; created_at: string }>();

        const relevant = rankMemories(results || [], query.trim(), 5);
        const result = buildMemoryContext(relevant);

        return new Response(
          JSON.stringify(result),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }

      // 8. Stage 4D: AI-Powered Chat Endpoint: POST /api/chat
      if (request.method === 'POST' && url.pathname === '/api/chat') {
        let body: any;

        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: 'Invalid JSON request body' }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        const rawMessage = body?.message;

        // 1. Validate the incoming message
        if (typeof rawMessage !== 'string' || !rawMessage.trim()) {
          return new Response(
            JSON.stringify({
              error: 'The "message" field is required and must be a non-empty string.',
            }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        const trimmedMessage = rawMessage.trim();

        // 2. Identify the current user ID using existing project behavior
        const userId =
          typeof body?.user_id === 'string' && body.user_id.trim()
            ? body.user_id.trim()
            : 'nur';

        // 3. Search relevant memories using parameterized query
        let relevantMemories: any[] = [];
        try {
          const { results } = await env.Db.prepare(
            'SELECT id, content, created_at FROM memories WHERE user_id = ? ORDER BY id DESC'
          )
            .bind(userId)
            .all<{ id: number; content: string; created_at: string }>();

          relevantMemories = rankMemories(results || [], trimmedMessage, 5);
        } catch (dbError) {
          console.error('Error fetching memories in chat:', dbError);
          relevantMemories = [];
        }

        // 4. Build the Stage 4C context
        const memoryContext = buildMemoryContext(relevantMemories);

        // 5. Build the model prompt
        const prompt = buildChatPrompt(trimmedMessage, memoryContext.context);

        // Check if GEMINI_API_KEY is configured
        if (!env.GEMINI_API_KEY || !env.GEMINI_API_KEY.trim()) {
          return new Response(
            JSON.stringify({
              error: 'GEMINI_API_KEY is not configured on the server.',
            }),
            {
              status: 503,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        // 6. Call Gemini server-side & 7. Extract generated text
        try {
          const reply = await callGemini(prompt, {
            apiKey: env.GEMINI_API_KEY,
            model: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
          });

          // 8. Return structured response without exposing internal secrets
          return new Response(
            JSON.stringify({
              reply,
              context: memoryContext.context,
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        } catch (aiError) {
          console.error('Gemini invocation failed:', aiError);
          return new Response(
            JSON.stringify({
              error: 'AI service unavailable',
            }),
            {
              status: 503,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }
      }

      // 6. Fallback for unhandled routes
      return new Response(
        JSON.stringify({
          error: 'Not found',
          path: url.pathname,
          availableEndpoints: [
            'GET /health',
            'POST /api/chat',
            'POST /api/memory',
            'GET /api/memory?user_id=<user_id>',
            'POST /api/memory/detect',
            'POST /api/memory/search',
            'POST /api/memory/context',
          ],
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: err?.message || 'An unexpected error occurred.',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
  },
};
