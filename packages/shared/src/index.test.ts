import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE_NAME } from './index';

describe('package smoke test', () => {
  it('exports the package name', () => {
    expect(SHARED_PACKAGE_NAME).toBe('@macgrading/shared');
  });
});
