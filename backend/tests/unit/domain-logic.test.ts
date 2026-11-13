import { describe, expect, it } from 'vitest';
import { AI_EMPLOYEE_SEEDS, DEPARTMENT_SEEDS } from '../../src/constant/company.constant';
import { computeDeterministicLeadScore } from '../../src/services/crm.service';
import { OpenAiAdapter } from '../../src/ai/adapters/openai.adapter';
import { AiProviderError } from '../../src/ai/ai-provider.interface';

describe('Company organization, CRM scoring & NPR 0 guardrails', () => {
  it('defines 6 departments and all 22 required logical AI employees including HR', () => {
    expect(DEPARTMENT_SEEDS).toHaveLength(6);
    expect(AI_EMPLOYEE_SEEDS).toHaveLength(22);
    const slugs = new Set(AI_EMPLOYEE_SEEDS.map((e) => e.slug));
    expect(slugs.size).toBe(22);
    expect(slugs.has('coo')).toBe(true);
    expect(slugs.has('cto')).toBe(true);
    expect(slugs.has('qa_engineer')).toBe(true);
    expect(slugs.has('security_engineer')).toBe(true);
    expect(slugs.has('hr_director')).toBe(true);
    expect(slugs.has('hr_compliance_auditor')).toBe(true);
  });

  it('computes deterministic CRM lead scores bounded to 0-100', () => {
    expect(computeDeterministicLeadScore({})).toBe(20);
    expect(
      computeDeterministicLeadScore({
        email: 'owner@hostel.com',
        phone: '9800000000',
        website: 'https://hostel.example',
        city: 'Kathmandu',
      }),
    ).toBe(100);
  });

  it('blocks paid OpenAI provider by default when ALLOW_PAID_PROVIDERS is false', async () => {
    const adapter = new OpenAiAdapter();
    expect(adapter.isPaid).toBe(true);
    await expect(
      adapter.complete({ systemPrompt: 'sys', userPrompt: 'hi' }),
    ).rejects.toBeInstanceOf(AiProviderError);
  });
});
