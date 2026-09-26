export interface Env {
  // Optional frontend origin for strict CORS in production
  FRONTEND_ORIGIN?: string;
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
    // Otherwise reflect the incoming request origin (or '*' fallback) to allow seamless development.
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
      // 2. Health Check: GET /health (and /api/health for convenience)
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

      // 3. Chat Endpoint: POST /api/chat
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

        if (typeof rawMessage !== 'string' || !rawMessage.trim()) {
          return new Response(
            JSON.stringify({ error: 'The "message" field is required and must be a non-empty string.' }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        const trimmed = rawMessage.trim();
        const lower = trimmed.toLowerCase();
        let reply = '';

        // Stage 2 Backend response rules:
        if (
          lower === 'hello' ||
          lower.startsWith('hello') ||
          lower === 'hi' ||
          lower.startsWith('hi ') ||
          lower.startsWith('hey')
        ) {
          reply = "Hello! I'm Group Study. What are you studying today?";
        } else if (lower.includes('photosynthesis')) {
          reply = "Photosynthesis is the process by which green plants use sunlight, water and carbon dioxide to produce food and oxygen.";
        } else {
          reply = "I received your message. The real AI will be connected in a later stage.";
        }

        return new Response(
          JSON.stringify({ reply }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }

      // 4. Fallback for unhandled routes
      return new Response(
        JSON.stringify({
          error: 'Not found',
          path: url.pathname,
          availableEndpoints: ['GET /health', 'POST /api/chat'],
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
