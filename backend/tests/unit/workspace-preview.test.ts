import { describe, expect, it } from 'vitest';
import { WorkspacePreviewService } from '../../src/services/workspace-preview.service';

describe('Workspace Live Frontend Preview Service', () => {
  const service = new WorkspacePreviewService();

  it('detects routes for aliza-wears e-commerce platform', () => {
    const routes = service.discoverRoutes('CodynexNepal', 'aliza-wears');
    expect(routes.length).toBeGreaterThanOrEqual(1);

    const paths = routes.map((r) => r.path);
    expect(paths).toContain('/');
  });

  it('renders interactive live HTML with Tailwind CSS, header, and products for aliza-wears', () => {
    const htmlHome = service.renderLivePreviewHtml('CodynexNepal', 'aliza-wears', '/');
    expect(htmlHome).toContain('Aliza Wears');
    expect(htmlHome).toContain('cdn.tailwindcss.com');
    expect(htmlHome).toContain('FESTIVE DROP');

    const htmlProducts = service.renderLivePreviewHtml('CodynexNepal', 'aliza-wears', '/products');
    expect(htmlProducts).toContain('Catalog');
    expect(htmlProducts).toContain('Crimson Zari Banarasi Saree');

    const htmlCart = service.renderLivePreviewHtml('CodynexNepal', 'aliza-wears', '/cart');
    expect(htmlCart).toContain('Shopping Cart & Secure Checkout');
    expect(htmlCart).toContain('eSewa');
  });

  it('renders hostel booking platform preview for HostelGhar', () => {
    const htmlHostel = service.renderLivePreviewHtml('CodynexNepal', 'Hostel_Ghar_Frontend', '/');
    expect(htmlHostel).toContain('HostelGhar');
    expect(htmlHostel).toContain('Kathmandu Valley');
  });

  it('lists available frontend workspaces', () => {
    const list = service.listAvailableFrontends();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]).toHaveProperty('framework');
    expect(list[0]).toHaveProperty('routes');
  });
});
