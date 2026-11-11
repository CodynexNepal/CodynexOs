import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/configs/app';
import { JwtTokenService } from '../../src/utils/jwt-token.util';
import { UserRole } from '../../src/constant/enum.constant';

describe('RBAC, DTO validation & parameter guard integration contracts', () => {
  const app = createApp();

  const tokenFor = (role: UserRole) =>
    JwtTokenService.signAccessToken({
      userId: '11111111-1111-4111-8111-111111111111',
      email: `${role.toLowerCase()}@codynex.local`,
      role,
      fullName: role,
    });

  it('rejects malformed login payload with 422 validation error', async () => {
    const res = await request(app)
      .post('/api/v1/codynex/auth/login')
      .send({ email: 'not-an-email', password: '' });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
  });

  it('rejects tampered JWT tokens with 401', async () => {
    const res = await request(app)
      .get('/api/v1/codynex/auth/me')
      .set('Authorization', 'Bearer tampered.jwt.token');
    expect(res.status).toBe(401);
  });

  it('rejects non-UUID route params with 400 before hitting database', async () => {
    const res = await request(app)
      .get('/api/v1/codynex/tasks/not-a-uuid/logs')
      .set('Authorization', `Bearer ${tokenFor(UserRole.CEO)}`);
    expect(res.status).toBe(400);
  });

  it('prevents OPERATOR from reviewing CEO approval requests (403)', async () => {
    const res = await request(app)
      .post('/api/v1/codynex/approvals/11111111-1111-4111-8111-111111111111/review')
      .set('Authorization', `Bearer ${tokenFor(UserRole.OPERATOR)}`)
      .send({ decision: 'APPROVED' });
    expect(res.status).toBe(403);
  });

  it('prevents VIEWER from issuing CEO commands (403)', async () => {
    const res = await request(app)
      .post('/api/v1/codynex/command')
      .set('Authorization', `Bearer ${tokenFor(UserRole.VIEWER)}`)
      .send({ instruction: 'Build a new analytics module for Hostel Ghar' });
    expect(res.status).toBe(403);
  });
});
