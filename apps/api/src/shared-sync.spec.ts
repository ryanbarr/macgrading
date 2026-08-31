import { CertCounterType, CertStatus, Role } from '@prisma/client';
import { CERT_COUNTER_TYPES, CERT_STATUSES, ROLES } from '@macgrading/shared';

describe('shared unions stay in sync with Prisma enums', () => {
  it('Role', () => {
    expect(Object.values(Role).sort()).toEqual([...ROLES].sort());
  });

  it('CertStatus', () => {
    expect(Object.values(CertStatus).sort()).toEqual([...CERT_STATUSES].sort());
  });

  it('CertCounterType', () => {
    expect(Object.values(CertCounterType).sort()).toEqual([...CERT_COUNTER_TYPES].sort());
  });
});
