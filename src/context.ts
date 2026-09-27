export interface MemoryItemRef {
  id?: number;
  content: string;
  created_at?: string;
}

export interface MemoryContextResult {
  hasMemory: boolean;
  memoryCount: number;
  context: string;
}

export interface BuildMemoryContextOptions {
  isError?: boolean;
  maxMemories?: number;
  maxMemoryLength?: number;
  maxContextLength?: number;
}

/**
 * Stage 4C: Memory Context Builder.
 * Converts relevant memories into a clean, structured context object/string
 * ready for consumption by response generators.
 *
 * Enforces:
 * - Max 5 memories (default)
 * - Max 500 characters per individual memory (truncated safely)
 * - Max 2000 characters for complete memory context (truncated safely)
 * - Safe fallback when no memories are found or when search fails
 */
export function buildMemoryContext(
  memories?: MemoryItemRef[] | null,
  options?: BuildMemoryContextOptions
): MemoryContextResult {
  if (options?.isError) {
    return {
      hasMemory: false,
      memoryCount: 0,
      context: 'User Memory Context:\nNo relevant memories available.',
    };
  }

  if (!memories || !Array.isArray(memories) || memories.length === 0) {
    return {
      hasMemory: false,
      memoryCount: 0,
      context: 'User Memory Context:\nNo relevant memories found.',
    };
  }

  const maxMemories = options?.maxMemories ?? 5;
  const maxMemoryLength = options?.maxMemoryLength ?? 500;
  const maxContextLength = options?.maxContextLength ?? 2000;

  const validMemories = memories
    .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
    .slice(0, maxMemories);

  if (validMemories.length === 0) {
    return {
      hasMemory: false,
      memoryCount: 0,
      context: 'User Memory Context:\nNo relevant memories found.',
    };
  }

  const bulletLines: string[] = [];

  for (const item of validMemories) {
    let text = item.content.trim();
    if (text.length > maxMemoryLength) {
      text = text.slice(0, maxMemoryLength - 3) + '...';
    }
    bulletLines.push(`- ${text}`);
  }

  const header = 'User Memory Context:\n';
  let fullContext = header + bulletLines.join('\n');

  if (fullContext.length > maxContextLength) {
    fullContext = fullContext.slice(0, maxContextLength - 3) + '...';
  }

  return {
    hasMemory: true,
    memoryCount: bulletLines.length,
    context: fullContext,
  };
}
