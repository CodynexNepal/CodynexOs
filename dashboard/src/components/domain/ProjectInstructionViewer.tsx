"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  CreditCard,
  Layers,
  Palette,
  Rocket,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";

interface PhaseItem {
  number: number;
  title: string;
  content: string;
  category: string;
}

interface ParsedInstruction {
  isStructured: boolean;
  intro: string;
  phases: PhaseItem[];
  mission: string | null;
  sopNotice: string | null;
  rawFormatted: string;
}

function getCategoryIcon(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("research") || lower.includes("competitor") || lower.includes("analy")) {
    return <Search className="h-4 w-4 text-sky-600" />;
  }
  if (lower.includes("audit") || lower.includes("inspect") || lower.includes("security")) {
    return <ShieldCheck className="h-4 w-4 text-amber-600" />;
  }
  if (lower.includes("build") || lower.includes("develop") || lower.includes("arch")) {
    return <Code2 className="h-4 w-4 text-emerald-600" />;
  }
  if (lower.includes("feature") || lower.includes("catalog") || lower.includes("cart")) {
    return <Sparkles className="h-4 w-4 text-purple-600" />;
  }
  if (lower.includes("payment") || lower.includes("esewa") || lower.includes("khalti")) {
    return <CreditCard className="h-4 w-4 text-indigo-600" />;
  }
  if (lower.includes("brand") || lower.includes("design") || lower.includes("ui") || lower.includes("palette")) {
    return <Palette className="h-4 w-4 text-rose-600" />;
  }
  if (lower.includes("quality") || lower.includes("test") || lower.includes("qa")) {
    return <CheckCircle2 className="h-4 w-4 text-teal-600" />;
  }
  if (lower.includes("deploy") || lower.includes("devops") || lower.includes("ci") || lower.includes("actions")) {
    return <Rocket className="h-4 w-4 text-brand-ink" />;
  }
  return <Layers className="h-4 w-4 text-ink-muted" />;
}

function parseInstructionText(raw: string): ParsedInstruction {
  if (!raw || typeof raw !== "string") {
    return {
      isStructured: false,
      intro: "",
      phases: [],
      mission: null,
      sopNotice: null,
      rawFormatted: "",
    };
  }

  const clean = raw.trim();

  // Extract Mission
  let mission: string | null = null;
  const missionMatch = clean.match(/\*\*Mission:\s*(.*?)\*\*/i) || clean.match(/Mission:\s*([^\n\r]+)/i);
  if (missionMatch && missionMatch[1]) {
    mission = missionMatch[1].replace(/\*\*/g, "").trim();
  }

  // Extract SOP Notice if present
  let sopNotice: string | null = null;
  const sopMatch = clean.match(/(Follow SOP-[\w-]+:[^.]+?\.)/i);
  if (sopMatch && sopMatch[1]) {
    sopNotice = sopMatch[1].replace(/\*\*/g, "").trim();
  }

  // Detect numbered phases e.g. "1. **Research:** ... 2. **Audit:** ..."
  const phaseRegex = /(\d+)\.\s*\*{0,2}([^:*]+)[:*]{1,2}\s*(.*?)(?=(?:\d+\.\s*\*{0,2}[^:*]+[:*]|\*\*Mission:|$))/gi;
  const matches = Array.from(clean.matchAll(phaseRegex));

  if (matches.length >= 2) {
    const firstMatchIdx = matches[0] ? matches[0].index ?? 0 : 0;
    const introRaw = clean.slice(0, firstMatchIdx).replace(/\*\*/g, "").trim();

    const phases: PhaseItem[] = matches.map((m) => {
      const num = parseInt(m[1] ?? "1", 10);
      const title = (m[2] ?? "Phase").replace(/\*\*/g, "").trim();
      let content = (m[3] ?? "").replace(/\*\*/g, "").trim();
      if (sopNotice && content.includes(sopNotice)) {
        content = content.replace(sopNotice, "").trim();
      }
      return {
        number: num,
        title,
        content,
        category: title,
      };
    });

    return {
      isStructured: true,
      intro: introRaw,
      phases,
      mission,
      sopNotice,
      rawFormatted: clean.replace(/\*\*/g, ""),
    };
  }

  return {
    isStructured: false,
    intro: clean.replace(/\*\*/g, ""),
    phases: [],
    mission,
    sopNotice,
    rawFormatted: clean.replace(/\*\*/g, ""),
  };
}

export function ProjectInstructionViewer({
  instruction,
  projectTitle,
}: {
  instruction: string;
  projectTitle?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseInstructionText(instruction);

  if (!parsed.isStructured) {
    return (
      <div className="mt-2.5 rounded-lg border border-surface-border bg-surface-muted/30 p-3.5 text-xs text-ink leading-relaxed">
        <p className="whitespace-pre-wrap">{parsed.intro || instruction}</p>
        {parsed.mission && (
          <div className="mt-2.5 flex items-center gap-2 rounded border border-emerald-300 bg-emerald-50/80 px-2.5 py-1.5 font-semibold text-emerald-900">
            <Target className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>Mission: {parsed.mission}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Executive Mandate & Team Composition Banner */}
      <div className="rounded-lg border border-brand/40 bg-brand/5 p-3.5 text-xs text-ink">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand/20 pb-2">
          <div className="flex items-center gap-2 font-bold text-brand-ink">
            <Users className="h-4 w-4 text-brand-ink" />
            <span>Executive Mandate &amp; Autonomous AI Directives</span>
          </div>
          <Badge tone="blue">Autonomous Execution</Badge>
        </div>
        <p className="mt-2 text-ink/90 leading-relaxed font-medium">
          {parsed.intro || `Complete engineering execution for ${projectTitle || "Project"}.`}
        </p>

        {/* Compact Phase Pills when not fully expanded */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 border-t border-brand/10">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mr-1">
            Phases:
          </span>
          {parsed.phases.map((p) => (
            <span
              key={p.number}
              className="inline-flex items-center gap-1 rounded bg-surface border border-surface-border px-2 py-0.5 text-[11px] font-semibold text-ink"
            >
              <span className="text-brand-ink font-bold">{p.number}.</span>
              {p.title}
            </span>
          ))}

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-brand-ink hover:underline"
          >
            {expanded ? (
              <>
                <span>Collapse Phases</span>
                <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                <span>Expand All Phase Details</span>
                <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expanded Structured Grid View */}
      {expanded && (
        <div className="grid gap-2.5 sm:grid-cols-2 pt-1">
          {parsed.phases.map((p) => (
            <div
              key={p.number}
              className="flex flex-col justify-between rounded-md border border-surface-border bg-surface p-3 text-xs shadow-sm hover:border-ink/30 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-muted border border-surface-border font-mono text-[11px] font-bold text-brand-ink">
                      {p.number}
                    </div>
                    <span className="font-bold text-ink">{p.title}</span>
                  </div>
                  {getCategoryIcon(p.title)}
                </div>
                <p className="mt-2 text-ink-muted leading-relaxed text-[11.5px] pl-8">
                  {p.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SOP & Compliance Notice */}
      {parsed.sopNotice && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50/70 p-2 text-xs text-amber-950 font-medium">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{parsed.sopNotice}</span>
        </div>
      )}

      {/* Core Mission Target Callout */}
      {parsed.mission && (
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-300 bg-emerald-50/90 px-3.5 py-2.5 text-xs text-emerald-950 font-bold shadow-sm">
          <Target className="h-4.5 w-4.5 shrink-0 text-emerald-700" />
          <span>Mission: {parsed.mission}</span>
        </div>
      )}
    </div>
  );
}
