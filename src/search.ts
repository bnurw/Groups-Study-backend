export interface MemoryItem {
  id: number;
  content: string;
  created_at: string;
}

export interface ScoredMemory extends MemoryItem {
  relevanceScore: number;
  matchedKeywordsCount: number;
}

// Common English and Bengali stop words that carry no semantic relevance
const STOP_WORDS = new Set([
  'what',
  'is',
  'my',
  'the',
  'a',
  'an',
  'i',
  'am',
  'are',
  'do',
  'does',
  'did',
  'you',
  'me',
  'tell',
  'about',
  'please',
  'in',
  'of',
  'to',
  'for',
  'and',
  'or',
  'it',
  'was',
  'can',
  'could',
  'would',
  'be',
  'have',
  'has',
  'had',
  'this',
  'that',
  'at',
  'on',
  'with',
  'from',
  'by',
  'as',
  'where',
  'who',
  'how',
  'why',
  'which',
  // Bengali stop words / conversational particles
  'ki',
  'konta',
  'kothay',
  'keno',
  'bolo',
  'janaw',
  'amar',
  'ami',
]);

// Conceptual aliases for domain-specific query intents
const CONCEPT_ALIASES: Record<string, string[]> = {
  // Study & Education
  study: ['student', 'studying', 'studies', 'pori', 'porashona', 'hsc', 'ssc', 'college', 'school'],
  student: ['study', 'studying', 'studies', 'pori', 'porashona', 'hsc', 'ssc'],
  studying: ['study', 'student'],
  studies: ['study', 'student'],
  pori: ['study', 'student'],
  porashona: ['study', 'student'],
  hsc: ['study', 'student'],
  ssc: ['study', 'student'],

  // Sports & Games
  sport: ['sports', 'football', 'cricket', 'soccer', 'tennis', 'khela'],
  sports: ['sport', 'football', 'cricket', 'soccer', 'tennis', 'khela'],
  khela: ['sport', 'sports', 'football', 'cricket'],

  // Location & Living
  live: ['living', 'lives', 'lived', 'thaki', 'location'],
  living: ['live', 'thaki', 'location'],
  lives: ['live', 'thaki', 'location'],
  location: ['live', 'living', 'lives', 'thaki'],
  thaki: ['live', 'location'],

  // Name
  name: ['nam'],
  nam: ['name'],

  // Likes & Interests (Bangla)
  pochondo: ['like', 'love'],
  like: ['pochondo'],

  // Subject
  subject: ['subjects', 'bishoy'],
  subjects: ['subject', 'bishoy'],
  bishoy: ['subject'],

  // Favorites
  favorite: ['favourite', 'fav'],
  favourite: ['favorite', 'fav'],
  fav: ['favorite', 'favourite'],
};

/**
 * Extracts normalized, non-stopword keywords from a query string.
 */
export function extractKeywords(query: string): string[] {
  if (!query || !query.trim()) return [];

  const cleaned = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .trim();

  if (!cleaned) return [];

  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  const keywords = rawTokens.filter((token) => !STOP_WORDS.has(token) && token.length > 1);

  return keywords;
}

/**
 * Normalizes content into an array of lowercase alphanumeric tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Stage 4B: Deterministic keyword-based relevance search for memories.
 * Compares query keywords against memory content, computes relevance scores,
 * and returns top matching memories (max 5).
 */
export function rankMemories(memories: MemoryItem[], query: string, maxResults = 5): MemoryItem[] {
  const keywords = extractKeywords(query);

  if (keywords.length === 0 || memories.length === 0) {
    return [];
  }

  const scored: ScoredMemory[] = [];

  for (const memory of memories) {
    const memTokens = tokenize(memory.content || '');
    const memTokenSet = new Set(memTokens);

    let memoryScore = 0;
    let matchedKeywords = 0;

    for (const kw of keywords) {
      // 1. Exact word match in memory (+10 points)
      if (memTokenSet.has(kw)) {
        memoryScore += 10;
        matchedKeywords++;
        continue;
      }

      // 2. Conceptual alias match (+8 points)
      const aliases = CONCEPT_ALIASES[kw];
      let aliasMatched = false;
      if (aliases) {
        for (const alias of aliases) {
          if (memTokenSet.has(alias)) {
            memoryScore += 8;
            matchedKeywords++;
            aliasMatched = true;
            break;
          }
        }
      }
      if (aliasMatched) continue;

      // 3. Stemming / prefix match for words length >= 4 (+5 points)
      if (kw.length >= 4) {
        for (const token of memTokens) {
          if (
            token.length >= 4 &&
            (token.startsWith(kw) || kw.startsWith(token))
          ) {
            memoryScore += 5;
            matchedKeywords++;
            break;
          }
        }
      }
    }

    // Only return memories with at least one meaningful keyword match
    if (matchedKeywords > 0 && memoryScore > 0) {
      scored.push({
        ...memory,
        relevanceScore: memoryScore,
        matchedKeywordsCount: matchedKeywords,
      });
    }
  }

  // Sort: highest number of matched keywords first, then highest score, then newest id
  scored.sort((a, b) => {
    if (b.matchedKeywordsCount !== a.matchedKeywordsCount) {
      return b.matchedKeywordsCount - a.matchedKeywordsCount;
    }
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return b.id - a.id;
  });

  return scored.slice(0, maxResults).map(({ id, content, created_at }) => ({
    id,
    content,
    created_at,
  }));
}
