/**
 * Tixly Show Matcher
 * Matches Tixly shows to Notion records using multiple strategies
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import type {
  ParsedTixlyShow,
  NotionShow,
  MatchResult,
  MatchMethod,
  TixlyShowMapping,
} from './types';

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1)
 */
function stringSimilarity(a: string, b: string): number {
  const normalizedA = a.toLowerCase().trim();
  const normalizedB = b.toLowerCase().trim();

  if (normalizedA === normalizedB) return 1.0;
  if (normalizedA.length === 0 || normalizedB.length === 0) return 0.0;

  const maxLen = Math.max(normalizedA.length, normalizedB.length);
  const distance = levenshteinDistance(normalizedA, normalizedB);

  return 1 - distance / maxLen;
}

/**
 * Check if two names are likely the same show
 * Handles variations like "Espen Lind" vs "Espen Lind - m/band"
 */
function namesMatch(tixlyName: string, notionName: string): boolean {
  const a = tixlyName.toLowerCase().trim();
  const b = notionName.toLowerCase().trim();

  // Exact match
  if (a === b) return true;

  // One contains the other
  if (a.includes(b) || b.includes(a)) return true;

  // Extract core name (before any dash or colon)
  const coreA = a.split(/[-–—:]/).map(s => s.trim()).filter(s => s)[0] || a;
  const coreB = b.split(/[-–—:]/).map(s => s.trim()).filter(s => s)[0] || b;

  if (coreA === coreB) return true;
  if (coreA.includes(coreB) || coreB.includes(coreA)) return true;

  // High similarity
  if (stringSimilarity(coreA, coreB) > 0.85) return true;

  return false;
}

/**
 * Calculate match score between Tixly show and Notion show
 */
function calculateMatchScore(tixly: ParsedTixlyShow, notion: NotionShow): number {
  let score = 0;

  // Date match is critical (0.4 weight)
  if (tixly.date === notion.date) {
    score += 0.4;
  } else {
    // Small penalty for each day difference
    const tixlyDate = new Date(tixly.date);
    const notionDate = new Date(notion.date);
    const daysDiff = Math.abs((tixlyDate.getTime() - notionDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 1) {
      score += 0.3;
    } else if (daysDiff <= 3) {
      score += 0.1;
    }
    // More than 3 days apart, no date score
  }

  // Name similarity (0.5 weight)
  const nameSim = stringSimilarity(tixly.cleanName, notion.name);
  score += nameSim * 0.5;

  // Time match bonus (0.1 weight)
  if (tixly.time && notion.time && tixly.time === notion.time) {
    score += 0.1;
  } else if (tixly.time && notion.time) {
    // Partial credit for close times
    const [tH, tM] = tixly.time.split(':').map(Number);
    const [nH, nM] = notion.time.split(':').map(Number);
    const tMinutes = tH * 60 + tM;
    const nMinutes = nH * 60 + nM;
    if (Math.abs(tMinutes - nMinutes) <= 60) {
      score += 0.05;
    }
  }

  return Math.min(score, 1.0);
}

/**
 * Look up existing mapping in database
 */
async function lookupExistingMapping(
  supabase: SupabaseClient,
  orgId: string,
  hash: string
): Promise<TixlyShowMapping | null> {
  const { data, error } = await supabase
    .from('tixly_show_mappings')
    .select('*')
    .eq('organization_id', orgId)
    .eq('tixly_hash', hash)
    .single();

  if (error || !data) {
    return null;
  }

  return data as TixlyShowMapping;
}

/**
 * Store a new mapping in the database
 */
async function storeMapping(
  supabase: SupabaseClient,
  orgId: string,
  tixly: ParsedTixlyShow,
  notion: NotionShow | null,
  method: MatchMethod,
  confidence: number
): Promise<void> {
  const mappingData = {
    organization_id: orgId,
    tixly_show_name: tixly.rawName,
    tixly_show_date: tixly.date,
    tixly_show_time: tixly.time,
    tixly_hash: tixly.hash,
    notion_show_id: notion?.notionId || null,
    notion_stop_id: notion?.stopNotionId || null,
    notion_project_id: notion?.projectNotionId || null,
    match_method: method,
    match_confidence: confidence,
    matched_by: 'system',
    is_confirmed: method === 'exact' && confidence >= 0.95,
    last_seen_at: new Date().toISOString(),
  };

  await supabase
    .from('tixly_show_mappings')
    .upsert(mappingData, {
      onConflict: 'organization_id,tixly_hash',
    });
}

/**
 * Update last_seen_at for existing mapping
 */
async function updateMappingLastSeen(
  supabase: SupabaseClient,
  mappingId: string
): Promise<void> {
  await supabase
    .from('tixly_show_mappings')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', mappingId);
}

/**
 * Find exact match by date and name
 */
function findExactMatch(
  tixly: ParsedTixlyShow,
  notionShows: NotionShow[]
): NotionShow | null {
  // First try: exact date and time match with high name similarity
  for (const notion of notionShows) {
    if (tixly.date === notion.date &&
        tixly.time === notion.time &&
        namesMatch(tixly.cleanName, notion.name)) {
      return notion;
    }
  }

  // Second try: exact date match (any time) with name match
  for (const notion of notionShows) {
    if (tixly.date === notion.date && namesMatch(tixly.cleanName, notion.name)) {
      return notion;
    }
  }

  return null;
}

/**
 * Find best fuzzy match with scoring
 */
function findFuzzyMatch(
  tixly: ParsedTixlyShow,
  notionShows: NotionShow[],
  minScore: number = 0.7
): { show: NotionShow; score: number } | null {
  let bestMatch: { show: NotionShow; score: number } | null = null;

  for (const notion of notionShows) {
    const score = calculateMatchScore(tixly, notion);

    if (score >= minScore && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { show: notion, score };
    }
  }

  return bestMatch;
}

/**
 * Use AI (Claude) to match a show when deterministic methods fail
 */
async function findAIMatch(
  tixly: ParsedTixlyShow,
  notionShows: NotionShow[]
): Promise<{ show: NotionShow; confidence: number; reasoning: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set, skipping AI matching');
    return null;
  }

  // Filter to shows within reasonable date range
  const tixlyDate = new Date(tixly.date);
  const relevantShows = notionShows.filter(n => {
    const notionDate = new Date(n.date);
    const daysDiff = Math.abs((tixlyDate.getTime() - notionDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff <= 7; // Within a week
  });

  if (relevantShows.length === 0) {
    return null;
  }

  const anthropic = new Anthropic({ apiKey });

  const prompt = `You are matching ticket sales data to a show database.

Given a show from a Tixly ticket report:
- Name: "${tixly.cleanName}"
- Date: ${tixly.date}
- Time: ${tixly.time || 'not specified'}

And these upcoming shows from the Notion database:
${relevantShows.map((s, i) => `${i + 1}. "${s.name}" on ${s.date} at ${s.time || 'TBD'} at ${s.venue || 'unknown venue'}`).join('\n')}

Which Notion show is this referring to? Consider:
1. Artist/show names may be abbreviated or formatted differently
2. Dates should match exactly or be very close
3. Times should align if both are specified

Respond ONLY with valid JSON (no markdown, no explanation):
{"match_index": N or null, "confidence": 0.0-1.0, "reasoning": "brief explanation"}

Where match_index is the 1-based index from the list above, or null if no match.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const result = JSON.parse(jsonMatch[0]);

    if (result.match_index === null || result.match_index < 1 || result.match_index > relevantShows.length) {
      return null;
    }

    return {
      show: relevantShows[result.match_index - 1],
      confidence: Math.min(Math.max(result.confidence || 0.5, 0), 1),
      reasoning: result.reasoning || 'AI match',
    };
  } catch (error) {
    console.error('AI matching error:', error);
    return null;
  }
}

/**
 * Main matching function - tries all strategies in order
 */
export async function matchTixlyShow(
  supabase: SupabaseClient,
  tixly: ParsedTixlyShow,
  orgId: string,
  notionShows: NotionShow[]
): Promise<MatchResult> {
  // 1. Check existing mapping (confirmed)
  const existingMapping = await lookupExistingMapping(supabase, orgId, tixly.hash);

  if (existingMapping && existingMapping.is_confirmed && existingMapping.notion_show_id) {
    // Update last seen
    await updateMappingLastSeen(supabase, existingMapping.id);

    // Find the Notion show
    const notionShow = notionShows.find(n => n.notionId === existingMapping.notion_show_id);

    if (notionShow) {
      return {
        matched: true,
        notionShow,
        method: 'mapping',
        confidence: existingMapping.match_confidence || 1.0,
        isNewMatch: false,
      };
    }
  }

  // 2. Check existing mapping (unconfirmed)
  if (existingMapping && existingMapping.notion_show_id) {
    await updateMappingLastSeen(supabase, existingMapping.id);

    const notionShow = notionShows.find(n => n.notionId === existingMapping.notion_show_id);

    if (notionShow) {
      return {
        matched: true,
        notionShow,
        method: existingMapping.match_method as MatchMethod,
        confidence: existingMapping.match_confidence || 0.8,
        isNewMatch: false,
      };
    }
  }

  // 3. Try exact match
  const exactMatch = findExactMatch(tixly, notionShows);
  if (exactMatch) {
    await storeMapping(supabase, orgId, tixly, exactMatch, 'exact', 0.95);
    return {
      matched: true,
      notionShow: exactMatch,
      method: 'exact',
      confidence: 0.95,
      isNewMatch: true,
    };
  }

  // 4. Try fuzzy match
  const fuzzyMatch = findFuzzyMatch(tixly, notionShows, 0.75);
  if (fuzzyMatch) {
    await storeMapping(supabase, orgId, tixly, fuzzyMatch.show, 'fuzzy', fuzzyMatch.score);
    return {
      matched: true,
      notionShow: fuzzyMatch.show,
      method: 'fuzzy',
      confidence: fuzzyMatch.score,
      isNewMatch: true,
    };
  }

  // 5. Try AI match
  const aiMatch = await findAIMatch(tixly, notionShows);
  if (aiMatch && aiMatch.confidence >= 0.6) {
    await storeMapping(supabase, orgId, tixly, aiMatch.show, 'ai', aiMatch.confidence);
    return {
      matched: true,
      notionShow: aiMatch.show,
      method: 'ai',
      confidence: aiMatch.confidence,
      isNewMatch: true,
      reasoning: aiMatch.reasoning,
    };
  }

  // 6. No match found
  return {
    matched: false,
    notionShow: null,
    method: null,
    confidence: 0,
    isNewMatch: false,
  };
}

/**
 * Match all shows in a batch (optimized for single Notion fetch)
 */
export async function matchAllShows(
  supabase: SupabaseClient,
  shows: ParsedTixlyShow[],
  orgId: string,
  notionShows: NotionShow[]
): Promise<Map<string, MatchResult>> {
  const results = new Map<string, MatchResult>();

  for (const show of shows) {
    const result = await matchTixlyShow(supabase, show, orgId, notionShows);
    results.set(show.hash, result);
  }

  return results;
}
