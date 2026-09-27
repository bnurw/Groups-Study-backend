import { DEFAULT_GEMINI_MODEL } from './config';

export interface CallGeminiOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * Stage 4D: Server-side Gemini API invocation.
 * Supports both Cloudflare Workers edge runtime (via standard fetch)
 * and Node.js environments (via @google/genai SDK when available).
 */
export async function callGemini(
  prompt: string,
  options: CallGeminiOptions
): Promise<string> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const model = options.model?.trim() || DEFAULT_GEMINI_MODEL;

  // 1. In Node.js environment where @google/genai is available:
  try {
    const genaiMod: any = await import('@google/genai').catch(() => null);
    if (genaiMod && genaiMod.GoogleGenAI) {
      const ai = new genaiMod.GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      const text = response?.text?.trim();
      if (text) {
        return text;
      }
    }
  } catch (err: any) {
    console.error('Gemini SDK error:', err?.message || err);
    throw new Error('AI service unavailable');
  }

  // 2. Standard fetch fallback for Cloudflare Workers / Edge runtimes:
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const timeoutMs = options.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      }),
    });
  } catch (err: any) {
    clearTimeout(timer);
    console.error('Gemini request network/timeout error:', err?.message || err);
    throw new Error('AI service unavailable');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let errorDetails = '';
    try {
      const errData: any = await response.json();
      errorDetails = errData?.error?.message || response.statusText;
    } catch {
      errorDetails = response.statusText;
    }
    console.error(`Gemini API returned error status ${response.status}:`, errorDetails);
    throw new Error('AI service unavailable');
  }

  const data: any = await response.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;

  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('AI service unavailable');
  }

  return text.trim();
}
