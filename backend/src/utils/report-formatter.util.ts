export interface StructuredAiReport {
  summary?: string;
  deliverables?: Array<string | Record<string, unknown>>;
  risks?: Array<string | Record<string, unknown>>;
  nextRecommendations?: Array<string | Record<string, unknown>>;
  [key: string]: unknown;
}

export function extractJsonObjectString(raw: string): string | null {
  const withoutThinking = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const cleaned = withoutThinking
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!cleaned) return null;

  try {
    const direct = JSON.parse(cleaned);
    if (direct && typeof direct === 'object') {
      return JSON.stringify(direct);
    }
  } catch {
    // Fall through to balanced-brace extraction
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') {
        return JSON.stringify(parsed);
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function parseStructuredAiResult(raw: string): StructuredAiReport | null {
  const jsonStr = extractJsonObjectString(raw);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as StructuredAiReport;
    }
  } catch {
    return null;
  }
  return null;
}

function formatListItem(item: unknown): string {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item);
  const obj = item as Record<string, unknown>;
  const heading = obj.phase ?? obj.title ?? obj.name ?? obj.step ?? obj.area;
  const body = obj.details ?? obj.description ?? obj.summary ?? obj.action;
  if (heading && body) return `${String(heading)}: ${String(body)}`;
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' — ');
}

export function formatReportAsReadableText(params: {
  provider: string;
  model: string;
  tokens: number;
  rawContent: string;
  parsed: StructuredAiReport | null;
}): string {
  const { provider, model, tokens, rawContent, parsed } = params;
  if (!parsed) {
    return `${rawContent.trim()}\n\n— Executed via ${provider}/${model} (${tokens} tokens)`;
  }

  const sections: string[] = [];
  if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
    sections.push(`Summary\n${parsed.summary.trim()}`);
  }

  if (Array.isArray(parsed.deliverables) && parsed.deliverables.length > 0) {
    sections.push(
      `Deliverables\n${parsed.deliverables.map((d) => `• ${formatListItem(d)}`).join('\n')}`,
    );
  }

  if (Array.isArray(parsed.risks) && parsed.risks.length > 0) {
    sections.push(`Risks & Mitigations\n${parsed.risks.map((r) => `• ${formatListItem(r)}`).join('\n')}`);
  }

  if (Array.isArray(parsed.nextRecommendations) && parsed.nextRecommendations.length > 0) {
    sections.push(
      `Next Recommendations\n${parsed.nextRecommendations.map((n) => `• ${formatListItem(n)}`).join('\n')}`,
    );
  }

  if (sections.length === 0) {
    return `${rawContent.trim()}\n\n— Executed via ${provider}/${model} (${tokens} tokens)`;
  }

  sections.push(`Metadata: ${provider}/${model} · ${tokens} tokens · $0.00`);
  return sections.join('\n\n');
}
