import { describe, expect, it } from 'vitest';
import { verificationGateService } from '../../src/services/verification-gate.service';
import { QaVerdict } from '../../src/constant/enum.constant';

describe('7-Gate Release Quality Verification Engine', () => {
  it('runs all 7 release quality gates for workspace and produces certificate', async () => {
    const cert = await verificationGateService.evaluateReleaseGates({
      owner: 'test-org',
      name: 'test-repo',
      taskId: '00000000-0000-0000-0000-000000000001',
    });

    expect(cert).toBeDefined();
    expect(cert.certificateId).toMatch(/^CERT-/);
    expect(cert.totalGates).toBe(7);
    expect(cert.gates).toHaveLength(7);

    const gateKeys = cert.gates.map((g) => g.gateKey);
    expect(gateKeys).toEqual([
      'requirements',
      'static_analysis',
      'automated_tests',
      'browser_validation',
      'security_hygiene',
      'git_diff_review',
      'final_signoff',
    ]);

    expect(cert.compositeScore).toBeGreaterThanOrEqual(0);
    expect(cert.compositeScore).toBeLessThanOrEqual(100);
    expect([QaVerdict.PASSED, QaVerdict.FAILED]).toContain(cert.verdict);
  });

  it('evaluates deliverable requirements checking accurately', async () => {
    const certWithDeliverable = await verificationGateService.evaluateReleaseGates({
      owner: 'test-org',
      name: 'test-repo',
      expectedDeliverables: ['non_existent_file_xyz_123.ts'],
    });

    const gate1 = certWithDeliverable.gates.find((g) => g.gateKey === 'requirements');
    expect(gate1).toBeDefined();
    expect(gate1?.status).toBe('FAIL');
    expect(gate1?.details).toContain('Missing required deliverables');
  });
});
