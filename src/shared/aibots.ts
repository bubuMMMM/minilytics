/**
 * AI crawlers and AI agents, matched on the User-Agent they announce (shared by the worker and the dashboard).
 * category: training = collects pages to train models · search = builds an AI search index ·
 * assistant = fetches a page live because a user asked an assistant.
 * Google-Extended and Applebot-Extended are robots.txt tokens only: Google and Apple crawl with Googlebot / Applebot,
 * so they can't be told apart by User-Agent (Applebot is listed; Googlebot is regular search and is not counted).
 */
export type BotCategory = 'training' | 'search' | 'assistant';
export interface AiBot { name: string; operator: string; category: BotCategory; match: RegExp }

export const AI_BOTS: AiBot[] = [
  { name: 'GPTBot', operator: 'OpenAI', category: 'training', match: /GPTBot/i },
  { name: 'ChatGPT-User', operator: 'OpenAI', category: 'assistant', match: /ChatGPT-User/i },
  { name: 'OAI-SearchBot', operator: 'OpenAI', category: 'search', match: /OAI-SearchBot/i },
  { name: 'ClaudeBot', operator: 'Anthropic', category: 'training', match: /ClaudeBot|anthropic-ai/i },
  { name: 'Claude-User', operator: 'Anthropic', category: 'assistant', match: /Claude-User|Claude-Web/i },
  { name: 'Claude-SearchBot', operator: 'Anthropic', category: 'search', match: /Claude-SearchBot/i },
  { name: 'PerplexityBot', operator: 'Perplexity', category: 'search', match: /PerplexityBot/i },
  { name: 'Perplexity-User', operator: 'Perplexity', category: 'assistant', match: /Perplexity-User/i },
  { name: 'Google-CloudVertexBot', operator: 'Google', category: 'assistant', match: /Google-CloudVertexBot/i },
  { name: 'Gemini', operator: 'Google', category: 'assistant', match: /Google-Gemini|Gemini-Deep-Research/i },
  { name: 'Applebot', operator: 'Apple', category: 'search', match: /Applebot/i },
  { name: 'Bytespider', operator: 'ByteDance', category: 'training', match: /Bytespider/i },
  { name: 'TikTokSpider', operator: 'ByteDance', category: 'training', match: /TikTokSpider/i },
  { name: 'CCBot', operator: 'Common Crawl', category: 'training', match: /CCBot/i },
  { name: 'Meta-ExternalAgent', operator: 'Meta', category: 'training', match: /meta-externalagent/i },
  { name: 'Meta-ExternalFetcher', operator: 'Meta', category: 'assistant', match: /meta-externalfetcher/i },
  { name: 'FacebookBot', operator: 'Meta', category: 'training', match: /FacebookBot/i },
  { name: 'Amazonbot', operator: 'Amazon', category: 'search', match: /Amazonbot/i },
  { name: 'DuckAssistBot', operator: 'DuckDuckGo', category: 'assistant', match: /DuckAssistBot/i },
  { name: 'MistralAI-User', operator: 'Mistral AI', category: 'assistant', match: /MistralAI-User/i },
  { name: 'cohere-ai', operator: 'Cohere', category: 'assistant', match: /cohere-ai/i },
  { name: 'cohere-training-data-crawler', operator: 'Cohere', category: 'training', match: /cohere-training-data-crawler/i },
  { name: 'YouBot', operator: 'You.com', category: 'search', match: /YouBot/i },
  { name: 'Diffbot', operator: 'Diffbot', category: 'training', match: /Diffbot/i },
  { name: 'AI2Bot', operator: 'Allen Institute for AI', category: 'training', match: /AI2Bot/i },
  { name: 'Timpibot', operator: 'Timpi', category: 'training', match: /Timpibot/i },
  { name: 'ImagesiftBot', operator: 'ImageSift', category: 'training', match: /ImagesiftBot/i },
  { name: 'Omgili', operator: 'Webz.io', category: 'training', match: /omgili/i },
];

/** One regex for cheap pre-filtering in forwarders and the tracker endpoint. */
export const AI_BOT_RE = new RegExp(AI_BOTS.map((b) => b.match.source).join('|'), 'i');

export function detectAiBot(ua: string | null | undefined, signatureAgent?: string | null): AiBot | null {
  // ChatGPT agent browses with a normal Chrome UA but signs requests (Web Bot Auth) with Signature-Agent: chatgpt.com.
  if (signatureAgent && /chatgpt\.com/i.test(signatureAgent)) return { name: 'ChatGPT Agent', operator: 'OpenAI', category: 'assistant', match: /$^/ };
  if (!ua || ua.length > 1000) return null;
  return AI_BOTS.find((b) => b.match.test(ua)) ?? null;
}

export const BOT_CATEGORY_LABEL: Record<BotCategory, string> = { training: 'Entraînement', search: 'Recherche IA', assistant: 'Assistant (à la demande)' };
