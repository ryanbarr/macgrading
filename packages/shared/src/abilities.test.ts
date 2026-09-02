import { describe, expect, it } from 'vitest';
import { defineAbilityFor } from './abilities';

describe('defineAbilityFor', () => {
  const teamMember = defineAbilityFor({ role: 'TEAM_MEMBER' });
  const admin = defineAbilityFor({ role: 'ADMIN' });

  it('team members can run the cert workflow', () => {
    expect(teamMember.can('create', 'Cert')).toBe(true);
    expect(teamMember.can('grade', 'Cert')).toBe(true);
    expect(teamMember.can('read', 'Cert')).toBe(true);
    expect(teamMember.can('read', 'Card')).toBe(true);
    expect(teamMember.can('read', 'GradeName')).toBe(true);
    expect(teamMember.can('create', 'CertPhoto')).toBe(true);
    expect(teamMember.can('delete', 'CertPhoto')).toBe(true);
  });

  it('team members cannot administer users or grade names', () => {
    expect(teamMember.can('manage', 'User')).toBe(false);
    expect(teamMember.can('create', 'User')).toBe(false);
    expect(teamMember.can('update', 'GradeName')).toBe(false);
    expect(teamMember.can('delete', 'GradeName')).toBe(false);
  });

  it('admins can do everything team members can', () => {
    expect(admin.can('create', 'Cert')).toBe(true);
    expect(admin.can('grade', 'Cert')).toBe(true);
    expect(admin.can('create', 'CertPhoto')).toBe(true);
  });

  it('admins can void certs; team members cannot', () => {
    expect(admin.can('void', 'Cert')).toBe(true);
    expect(teamMember.can('void', 'Cert')).toBe(false);
  });

  it('admins additionally manage users and grade names', () => {
    expect(admin.can('manage', 'User')).toBe(true);
    expect(admin.can('update', 'GradeName')).toBe(true);
    expect(admin.can('delete', 'User')).toBe(true);
  });
});
