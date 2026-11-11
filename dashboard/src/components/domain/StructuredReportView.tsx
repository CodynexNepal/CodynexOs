"use client";

import { Badge } from "@/components/ui/Badge";
import { formatNumber } from "@/lib/utils";

interface ParsedEnvelope {
  provider?: string;
  model?: string;
  tokens?: number;
  summary?: string;
  deliverables?: Array<{ title?: string; details: string }>;
  risks?: string[];
  nextRecommendations?: string[];
  plainText?: string;
}

function normalizeItems(rawList: unknown): Array<{ title?: string; details: string }> {
  if (!Array.isArray(rawList)) return [];
  return rawList.map((item) => {
    if (typeof item === "string") return { details: item };
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const title = obj.phase ?? obj.title ?? obj.name ?? obj.step;
      const details = obj.details ?? obj.description ?? obj.summary ?? obj.action;
      if (details) {
        return {
          ...(title ? { title: String(title) } : {}),
          details: String(details),
        };
      }
      return {
        details: Object.entries(obj)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(" — "),
      };
    }
    return { details: String(item) };
  });
}

function extractLegacyTruncatedFields(raw: string): ParsedEnvelope | null {
  if (!raw.trim().startsWith("{")) return null;
  const providerMatch = raw.match(/"provider"\s*:\s*"([^"]+)"/);
  const modelMatch = raw.match(/"model"\s*:\s*"([^"]+)"/);
  const tokensMatch = raw.match(/"tokens"\s*:\s*(\d+)/);

  let inner = raw;
  const resultIdx = raw.indexOf('"result":');
  if (resultIdx !== -1) {
    inner = raw.slice(resultIdx + 9).replace(/^[\s"]*/, "");
    inner = inner.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }

  const summaryMatch = inner.match(/"summary"\s*:\s*"([^"]+)"/);
  const phasePairs = Array.from(
    inner.matchAll(/"phase"\s*:\s*"([^"]+)"\s*,\s*"details"\s*:\s*"([^"]+)"/g)
  ).map((m) => ({ title: m[1], details: m[2]! }));

  if (!summaryMatch && phasePairs.length === 0) return null;

  return {
    provider: providerMatch?.[1],
    model: modelMatch?.[1],
    tokens: tokensMatch ? Number(tokensMatch[1]) : undefined,
    summary: summaryMatch?.[1],
    deliverables: phasePairs,
  };
}

function extractReadableSections(raw: string): ParsedEnvelope | null {
  if (!/^Summary\n/m.test(raw)) return null;

  const summaryMatch = raw.match(/Summary\n([\s\S]*?)(?:\n\n(?:Deliverables|Risks & Mitigations|Next Recommendations|Metadata:)|$)/);
  const delivMatch = raw.match(/Deliverables\n([\s\S]*?)(?:\n\n(?:Risks & Mitigations|Next Recommendations|Metadata:)|$)/);
  const risksMatch = raw.match(/Risks & Mitigations\n([\s\S]*?)(?:\n\n(?:Next Recommendations|Metadata:)|$)/);
  const nextMatch = raw.match(/Next Recommendations\n([\s\S]*?)(?:\n\nMetadata:|$)/);
  const metaMatch = raw.match(/Metadata:\s*([^/\s]+)\/([^\s·]+)\s*·\s*(\d+)\s*tokens/);

  const parseBullets = (block?: string) =>
    block
      ? block
          .split("\n")
          .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
          .filter(Boolean)
      : [];

  const deliverables = parseBullets(delivMatch?.[1]).map((line) => {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0 && colonIdx < 60) {
      return { title: line.slice(0, colonIdx).trim(), details: line.slice(colonIdx + 1).trim() };
    }
    return { details: line };
  });

  return {
    provider: metaMatch?.[1],
    model: metaMatch?.[2],
    tokens: metaMatch?.[3] ? Number(metaMatch[3]) : undefined,
    summary: summaryMatch?.[1]?.trim(),
    deliverables,
    risks: parseBullets(risksMatch?.[1]),
    nextRecommendations: parseBullets(nextMatch?.[1]),
  };
}

function parseContent(input: string | Record<string, unknown>): ParsedEnvelope {
  let obj: Record<string, unknown> | null = null;

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      try {
        obj = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        const legacy = extractLegacyTruncatedFields(trimmed);
        if (legacy) return legacy;
        return { plainText: trimmed };
      }
    } else {
      const readable = extractReadableSections(trimmed);
      if (readable) return readable;
      return { plainText: trimmed };
    }
  } else if (input && typeof input === "object") {
    obj = input;
  }

  if (!obj) return { plainText: "" };

  const provider = typeof obj.provider === "string" ? obj.provider : undefined;
  const model = typeof obj.model === "string" ? obj.model : undefined;
  const tokens = typeof obj.tokens === "number" ? obj.tokens : undefined;

  let innerReport: Record<string, unknown> | null = null;
  const candidate = obj.report ?? obj.result ?? obj;
  if (typeof candidate === "string") {
    const cleaned = candidate
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        innerReport = parsed as Record<string, unknown>;
      }
    } catch {
      return { provider, model, tokens, plainText: candidate };
    }
  } else if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    innerReport = candidate as Record<string, unknown>;
  }

  if (!innerReport) return { provider, model, tokens, plainText: JSON.stringify(obj, null, 2) };

  const summary = typeof innerReport.summary === "string" ? innerReport.summary : undefined;
  const deliverables = normalizeItems(innerReport.deliverables);
  const risks = normalizeItems(innerReport.risks).map((r) =>
    r.title ? `${r.title}: ${r.details}` : r.details
  );
  const nextRecommendations = normalizeItems(innerReport.nextRecommendations).map((n) =>
    n.title ? `${n.title}: ${n.details}` : n.details
  );

  if (!summary && deliverables.length === 0 && risks.length === 0 && nextRecommendations.length === 0) {
    return { provider, model, tokens, plainText: JSON.stringify(innerReport, null, 2) };
  }

  return {
    provider,
    model,
    tokens,
    summary,
    deliverables,
    risks,
    nextRecommendations,
  };
}

export function StructuredReportView({ content }: { content: string | Record<string, unknown> }) {
  const parsed = parseContent(content);

  if (parsed.plainText && !parsed.summary && !parsed.deliverables?.length) {
    return (
      <div className="space-y-2">
        {(parsed.provider || parsed.model || parsed.tokens !== undefined) && (
          <div className="flex flex-wrap gap-1.5">
            {parsed.provider && (
              <Badge tone="green">
                {parsed.provider}
                {parsed.model ? ` / ${parsed.model}` : ""}
              </Badge>
            )}
            {parsed.tokens !== undefined && (
              <Badge tone="gray">{formatNumber(parsed.tokens)} tokens</Badge>
            )}
          </div>
        )}
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">
          {parsed.plainText}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(parsed.provider || parsed.model || parsed.tokens !== undefined) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {parsed.provider && (
            <Badge tone="green">
              {parsed.provider}
              {parsed.model ? ` / ${parsed.model}` : ""}
            </Badge>
          )}
          {parsed.tokens !== undefined && (
            <Badge tone="gray">{formatNumber(parsed.tokens)} tokens · $0.00</Badge>
          )}
        </div>
      )}

      {parsed.summary && (
        <div className="rounded-md border border-surface-border bg-surface-muted/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Executive Summary
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">{parsed.summary}</p>
        </div>
      )}

      {parsed.deliverables && parsed.deliverables.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Deliverables
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {parsed.deliverables.map((d, idx) => (
              <div
                key={idx}
                className="rounded-md border border-surface-border bg-surface p-3 text-xs"
              >
                {d.title && <p className="font-bold text-ink">{d.title}</p>}
                <p className="mt-0.5 leading-relaxed text-ink-muted">{d.details}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {parsed.risks && parsed.risks.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Risks & Constraints
          </p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-ink-muted">
            {parsed.risks.map((r, idx) => (
              <li key={idx}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {parsed.nextRecommendations && parsed.nextRecommendations.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Recommended Next Steps
          </p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-ink-muted">
            {parsed.nextRecommendations.map((n, idx) => (
              <li key={idx}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
