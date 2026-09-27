export interface DetectedMemory {
  content: string;
}

/**
 * Stage 4A: Rule-based pattern matching for automatic memory detection.
 * Identifies explicit personal information (name, study, interests, favorites, location).
 */
export function detectMemoriesFromMessage(rawMessage: string): DetectedMemory[] {
  const message = rawMessage.trim();
  if (!message) return [];

  const lower = message.toLowerCase();

  // Exclude common greetings, general questions, and system commands
  const exclusions = [
    /^(hello|hi|hey|greetings|good morning|good afternoon|good evening)\b/i,
    /^(what|how|why|when|where|who|can you|could you|please explain|tell me about)\b/i,
    /^(give me a quiz|help me study|explain something|summarize)\b/i,
    /^what do you remember/i,
  ];

  for (const exclusion of exclusions) {
    if (exclusion.test(lower)) {
      return [];
    }
  }

  // Supported rule patterns (English & Bangla/Banglish)
  const patterns: RegExp[] = [
    // Name: "my name is ...", "amar nam ..."
    /\bmy name is\s+\S+/i,
    /\bamar nam\s+\S+/i,

    // Favorites: "my favorite subject is ...", "my favorite ...", "amar favorite subject ...", "amar favorite ..."
    /\bmy favorite subject is\s+\S+/i,
    /\bmy favorite\s+\S+/i,
    /\bamar favorite subject\s+\S+/i,
    /\bamar favorite\s+\S+/i,

    // Education / Student: "I am an HSC student", "I'm a student", "I study ...", "ami HSC student"
    /\b(i am|i'm)\s+an?\s+.*student\b/i,
    /\b(i am|i'm)\s+a\s+student\b/i,
    /\bami\s+.*student\b/i,
    /\bi study\s+\S+/i,

    // Interests: "I like ...", "I love ...", "amar pochondo ...", "ami ... pochondo kori"
    /\bi like\s+\S+/i,
    /\bi love\s+\S+/i,
    /\bamar pochondo\s+\S+/i,
    /\bami\s+.+\s+pochondo kori\b/i,

    // Location: "I live in ..."
    /\bi live in\s+\S+/i,

    // General Identity Statements: "I am ...", "I'm ...", "ami ..."
    /^(i am|i'm)\s+[a-z0-9]/i,
    /^ami\s+[a-z0-9]/i,
  ];

  const matched = patterns.some((pattern) => pattern.test(lower));

  if (matched) {
    return [{ content: message }];
  }

  return [];
}
