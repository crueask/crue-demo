/**
 * Tool name translations for natural language display
 */

export interface ToolNameTranslations {
  [toolName: string]: {
    en: string;
    no: string;
  };
}

export const toolNameTranslations: ToolNameTranslations = {
  queryData: {
    en: "Fetching data",
    no: "Henter data",
  },
  queryAdSpend: {
    en: "Analyzing ad costs",
    no: "Analyserer annonsekostnader",
  },
  compareEntities: {
    en: "Comparing data",
    no: "Sammenligner data",
  },
  analyzeEfficiency: {
    en: "Analyzing effectiveness",
    no: "Analyserer effektivitet",
  },
  generateChart: {
    en: "Creating visualization",
    no: "Lager visualisering",
  },
  getAvailableData: {
    en: "Checking available data",
    no: "Sjekker tilgjengelig data",
  },
  analyzeSalesTiming: {
    en: "Analyzing sales timing",
    no: "Analyserer salgstidspunkter",
  },
  getDailyTicketSales: {
    en: "Fetching daily ticket sales",
    no: "Henter daglig billettsalg",
  },
  calculatePeriodRoas: {
    en: "Calculating ROAS for period",
    no: "Beregner ROAS for perioden",
  },
  calculateBatchPeriodRoas: {
    en: "Calculating ROAS for multiple stops",
    no: "Beregner ROAS for flere stopp",
  },
};

/**
 * Detect language from text
 * Simple heuristic: if text contains Norwegian characters or common Norwegian words, it's Norwegian
 */
export function detectLanguage(text: string): "en" | "no" {
  // Norwegian-specific characters
  const norwegianChars = /[æøåÆØÅ]/;

  // Common Norwegian words that are unlikely in English
  const norwegianWords = /\b(hva|hvordan|hvorfor|hvem|når|hvor|jeg|deg|meg|seg|det|dette|den|denne|og|eller|men|for|til|fra|med|på|i|av|om|er|var|vil|kan|skal|skulle|ville|kunne|må|burde|har|hadde|kommer|kom|går|gikk|billettsalg|annonsekostnader|turnéstop|stopp|billett|billetter)\b/i;

  if (norwegianChars.test(text) || norwegianWords.test(text)) {
    return "no";
  }

  return "en";
}

/**
 * Get natural language name for a tool
 */
export function getToolDisplayName(toolName: string, language: "en" | "no" = "en"): string {
  const translation = toolNameTranslations[toolName];
  if (!translation) {
    // Fallback: return the tool name as-is if no translation exists
    return toolName;
  }
  return translation[language];
}

/**
 * Detect language from message history and return display name for tool
 */
export function getToolDisplayNameFromMessages(
  toolName: string,
  messages: Array<{ role: string; content: string }>
): string {
  // Get the first user message to detect language
  const firstUserMessage = messages.find(m => m.role === "user");
  const language = firstUserMessage ? detectLanguage(firstUserMessage.content) : "en";

  return getToolDisplayName(toolName, language);
}
