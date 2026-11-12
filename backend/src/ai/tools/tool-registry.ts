import { AiToolDefinition } from '../ai-provider.interface';

export interface RegisteredTool {
  definition: AiToolDefinition;
  requiredPermission: string;
  validateArgs: (args: Record<string, unknown>) => { valid: boolean; error?: string };
}

const UNSAFE_ARG_PATTERN = /\b(rm\s+-rf|drop\s+table|delete\s+from|;\s*--|child_process|eval\()\b/i;

function assertSafeString(val: unknown, field: string, maxLen = 500): string | null {
  if (typeof val !== 'string') return `${field} must be a string`;
  if (val.trim().length === 0) return `${field} cannot be empty`;
  if (val.length > maxLen) return `${field} exceeds ${maxLen} chars`;
  if (UNSAFE_ARG_PATTERN.test(val)) return `${field} contains disallowed pattern`;
  return null;
}

export const SAFE_TOOL_REGISTRY: Record<string, RegisteredTool> = {
  'memory.read': {
    requiredPermission: 'memory.read',
    definition: {
      name: 'memory.read',
      description: 'Search persistent CodyNex OS Company Memory for prior decisions and context.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords' },
        },
        required: ['query'],
      },
    },
    validateArgs: (args) => {
      const err = assertSafeString(args.query, 'query', 200);
      return err ? { valid: false, error: err } : { valid: true };
    },
  },
  'memory.write': {
    requiredPermission: 'memory.write',
    definition: {
      name: 'memory.write',
      description: 'Persist an architecture decision, lesson learned, or note to Company Memory.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short summary title' },
          content: { type: 'string', description: 'Detailed note' },
          category: {
            type: 'string',
            enum: ['TECH_DECISION', 'ARCHITECTURE', 'LESSON_LEARNED', 'STRATEGY'],
          },
        },
        required: ['title', 'content'],
      },
    },
    validateArgs: (args) => {
      const tErr = assertSafeString(args.title, 'title', 200);
      if (tErr) return { valid: false, error: tErr };
      const cErr = assertSafeString(args.content, 'content', 4000);
      if (cErr) return { valid: false, error: cErr };
      return { valid: true };
    },
  },
  'crm.leads.read': {
    requiredPermission: 'crm.leads.read',
    definition: {
      name: 'crm.leads.read',
      description: 'Read verified CRM leads filtered optionally by stage.',
      parameters: {
        type: 'object',
        properties: {
          stage: { type: 'string', description: 'Optional pipeline stage filter' },
        },
      },
    },
    validateArgs: (args) => {
      if (args.stage !== undefined) {
        const err = assertSafeString(args.stage, 'stage', 40);
        if (err) return { valid: false, error: err };
      }
      return { valid: true };
    },
  },
  'github.read': {
    requiredPermission: 'github.read',
    definition: {
      name: 'github.read',
      description: 'List connected GitHub repositories registered in CodyNex OS.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    validateArgs: () => ({ valid: true }),
  },
};

export function getAllowedToolDefinitions(allowedPermissions: string[]): AiToolDefinition[] {
  const permSet = new Set(allowedPermissions);
  return Object.values(SAFE_TOOL_REGISTRY)
    .filter((entry) => permSet.has(entry.requiredPermission))
    .map((entry) => entry.definition);
}
