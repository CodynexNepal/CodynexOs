import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/configs/app';
import { JwtTokenService } from '../../src/utils/jwt-token.util';
import { UserRole } from '../../src/constant/enum.constant';

describe('HTTP API security & health contracts', () => {
  const app = createApp();

  it('GET /health returns 200 OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('codynex-os-backend');
  });

  it('GET /api/v1/codynex/overview requires authentication (401)', async () => {
    const res = await request(app).get('/api/v1/codynex/overview');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/codynex/workers/tick rejects missing worker secret (401)', async () => {
    const res = await request(app).post('/api/v1/codynex/workers/tick');
    expect(res.status).toBe(401);
  });

  it('enforces CEO-only RBAC on settings (403 for OPERATOR)', async () => {
    const opToken = JwtTokenService.signAccessToken({
      userId: '22222222-2222-4222-8222-222222222222',
      email: 'op@codynex.local',
      role: UserRole.OPERATOR,
      fullName: 'Operator',
    });
    const res = await request(app)
      .put('/api/v1/codynex/settings')
      .set('Authorization', `Bearer ${opToken}`)
      .send({ key: 'cost_policy', value: {} });
    expect(res.status).toBe(403);
  });

  it('returns structured 404 JSON for unknown routes', async () => {
    const ceoToken = JwtTokenService.signAccessToken({
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'ceo@codynex.local',
      role: UserRole.CEO,
      fullName: 'CEO',
    });
    const public404 = await request(app).get('/unknown-endpoint');
    expect(public404.status).toBe(404);
    expect(public404.body.success).toBe(false);

    const auth404 = await request(app)
      .get('/api/v1/codynex/does-not-exist')
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(auth404.status).toBe(404);
    expect(auth404.body.success).toBe(false);
  });
});
