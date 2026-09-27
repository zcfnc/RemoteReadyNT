import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('React dashboard migration', () => {
  it('does not retain the removed timeline-current DOM dependency', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/features/dashboard/ExerciseTimeline.tsx'), 'utf8');
    expect(source).not.toContain('timeline-current');
  });
});
