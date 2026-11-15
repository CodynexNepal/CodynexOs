import { MemoryRepository } from '../repository/memory.repository';
import { ModelRouterService } from '../ai/router/model-router.service';
import { KnowledgeDocumentEntity } from '../entities/knowledge-document.entity';
import { socketServer } from '../socket/socket.server';
import { logger } from '../utils/logger.util';

export class SopLearningService {
  constructor(
    private readonly memoryRepo: MemoryRepository = new MemoryRepository(),
    private readonly modelRouter: ModelRouterService = new ModelRouterService(),
  ) {}

  /**
   * Automatically learn, synthesize, and persist a trusted SOP whenever a CEO prompt or directive is received.
   */
  async learnAndSynthesizeSopFromPrompt(params: {
    prompt: string;
    departmentId?: string | null;
    departmentSlug?: string;
    userId?: string | null;
  }): Promise<KnowledgeDocumentEntity | null> {
    const { prompt, departmentId, departmentSlug, userId } = params;
    const cleanPrompt = (prompt || '').trim();
    if (cleanPrompt.length < 8) return null;

    logger.info('Synthesizing learned SOP from CEO prompt', { prompt: cleanPrompt.slice(0, 80) });

    const systemPrompt = `You are the Principal Systems Architect & AI COO of CodyNex OS.
Your objective is to automatically synthesize a strict, professional Standard Operating Procedure (SOP) / Technical Playbook derived from the CEO's directive.

Mandatory Rules for this SOP:
1. Folder Structure & Completeness: For any engineering directive, the SOP must explicitly require a full folder structure (e.g. src/, controllers/, services/, models/, routes/, tests/, package.json).
2. Anti-README Rule: The SOP must state in unequivocal terms: "NEVER stop at only writing a README.md file. An implementation that produces only a README without complete runnable code files is strictly rejected."
3. Quality & Verification: Code must be verified through typecheck/tests before git commit.
4. Git Approval Guard: Incomplete projects must never be pushed to GitHub. Pushing requires verified source completeness and CEO sign-off.

Output strictly valid JSON with this shape:
{
  "title": "Clear, authoritative title (e.g., SOP: Full-Stack Scaffolding & Code Completeness for ...)",
  "contentMd": "Full markdown playbook text containing Objective, Mandatory Architecture & Folder Structure, Anti-README Enforcement, Quality Verification Gates, and Step-by-Step Rules."
}`;

    let title = `SOP: Architectural Standards for ${cleanPrompt.slice(0, 45)}...`;
    let contentMd = `# SOP: Architectural Standards & Code Completeness\n\n## Objective\nFulfill the CEO directive: "${cleanPrompt}"\n\n## Mandatory Folder Structure\nEvery implementation must scaffold complete source directories:\n- \`src/controllers/\`\n- \`src/services/\`\n- \`src/models/\`\n- \`src/routes/\`\n- \`src/utils/\`\n- \`package.json\`\n\n## Strict Anti-README Enforcement\nAI agents are strictly forbidden from delivering only a single \`README.md\` file. Complete functional code files must be generated and verified.\n\n## Quality & Git Gates\nNever push incomplete or placeholder repositories to GitHub. Run automated checks before opening Pull Requests.`;

    try {
      const res = await this.modelRouter.complete(
        {
          systemPrompt,
          userPrompt: `CEO Directive:\n"${cleanPrompt}"\nDepartment Scope: ${departmentSlug || 'Engineering / General'}`,
          responseFormat: 'json',
          maxOutputTokens: 1024,
        },
        { preferredProvider: 'groq', agentRole: 'SOP Synthesizer & Architect' },
      );

      const parsed = JSON.parse(res.content) as { title?: string; contentMd?: string };
      if (parsed.title) title = parsed.title;
      if (parsed.contentMd) contentMd = parsed.contentMd;
    } catch {
      // Deterministic fallback SOP synthesis guarantees 0 failure even during provider rate limits
      title = `SOP: Production Code & Full Scaffolding Standards (${cleanPrompt.slice(0, 30)})`;
      contentMd = `# SOP: Production Code & Full Scaffolding Standards\n\n## Context & CEO Instruction\n"${cleanPrompt}"\n\n## Mandatory Engineering Guidelines\n1. **Complete Folder Scaffolding**: All relevant modules, controllers, routes, and services must be written directly to the workspace.\n2. **Zero Incomplete Dummies**: Delivering solely a \`README.md\` is considered an execution failure. Functional code is mandatory.\n3. **Quality Gates**: Ensure lint, typecheck, and unit tests pass before committing.\n4. **Controlled GitHub Push**: Only push to remote when full project files are in place and approved.`;
    }

    const slug = `${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)}-${Date.now().toString(36)}`;

    try {
      const saved = await this.memoryRepo.saveKnowledge({
        title,
        slug,
        contentMd,
        departmentId: departmentId ?? null,
        isTrusted: true,
        createdBy: userId ?? null,
      });

      socketServer.emit('knowledge:sop_created', {
        id: saved.id,
        title: saved.title,
        slug: saved.slug,
        departmentId: saved.departmentId,
        isTrusted: saved.isTrusted,
        timestamp: new Date().toISOString(),
      });

      logger.info('Trusted SOP synthesized and stored in Knowledge Base', {
        sopId: saved.id,
        title: saved.title,
      });

      return saved;
    } catch (err: any) {
      logger.warn('Could not save synthesized SOP to Knowledge Base', { error: err.message });
      return null;
    }
  }

  /**
   * Retrieve all trusted SOPs for prompt injection into autonomous agents and orchestrator workers.
   */
  async getInjectedSopInstructions(departmentId?: string | null): Promise<string> {
    try {
      const sops = await this.memoryRepo.findTrustedKnowledgeForDepartment(departmentId || undefined);
      if (!sops || sops.length === 0) {
        return `[MANDATORY COMPANY SOP]:\n- Code Completeness: You MUST generate complete runnable files across the entire project structure. Delivering only a README.md is strictly forbidden.\n- Verification: Typecheck and test your code before marking done.`;
      }

      const formatted = sops
        .slice(0, 5)
        .map((s) => `### ${s.title}\n${s.contentMd.slice(0, 500)}`)
        .join('\n\n');

      return `[MANDATORY COMPANY SOPs & PLAYBOOKS TO FOLLOW]:\n${formatted}\n\nSTRICT REQUIREMENT: Follow the above SOPs without deviation. Scaffold full production folder structures. Do not return analysis-only text or a single README.md file.`;
    } catch {
      return `[MANDATORY COMPANY SOP]:\n- Full Project Scaffolding: Write complete functional source code across all required directories. Never return only a README.md file.`;
    }
  }
}

export const sopLearningService = new SopLearningService();
