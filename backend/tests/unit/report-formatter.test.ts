import { describe, expect, it } from 'vitest';
import {
  formatReportAsReadableText,
  parseStructuredAiResult,
} from '../../src/utils/report-formatter.util';

describe('Report formatter for Company Memory & Tasks UI', () => {
  it('parses fenced JSON AI output and formats readable prose without raw JSON escapes', () => {
    const raw =
      '```json\n{"summary":"Analyzed Kathmandu hostel market.","deliverables":[{"phase":"Directory Sourcing","details":"Collected 100 public listings"}],"risks":["Rate limits"],"nextRecommendations":["Request CEO approval"]}\n```';
    const parsed = parseStructuredAiResult(raw);
    expect(parsed?.summary).toBe('Analyzed Kathmandu hostel market.');

    const text = formatReportAsReadableText({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      tokens: 765,
      rawContent: raw,
      parsed,
    });

    expect(text).toContain('Executive Summary'.replace('Executive ', ''));
    expect(text).toContain('Directory Sourcing: Collected 100 public listings');
    expect(text).not.toContain('\\"');
  });
});
