import { describe, it, expect } from 'vitest';
import { hasRole, requireRole } from '../../../src/lib/auth/permissions';
import { WorkspaceRole, EntityStatus } from '../../../src/lib/types';
import type { WorkspaceAccess } from '../../../src/lib/auth/request';

function makeAccess(role: WorkspaceRole): WorkspaceAccess {
  return {
    session: { user_id: 'u1', email: 'u@example.com', access_token: 'x' },
    workspace: {
      id: 'w1',
      name: 'Test',
      slug: 'test',
      status: EntityStatus.Active,
      business_hours_json: {},
      stop_conditions_json: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    },
    membership: {
      id: 'm1',
      workspace_id: 'w1',
      user_id: 'u1',
      role,
      created_at: new Date().toISOString(),
    },
  };
}

describe('hasRole', () => {
  it('owner can do everything', () => {
    for (const min of [WorkspaceRole.ReadOnly, WorkspaceRole.Manager, WorkspaceRole.Admin, WorkspaceRole.Owner]) {
      expect(hasRole(WorkspaceRole.Owner, min)).toBe(true);
    }
  });

  it('admin meets admin/manager/read_only but not owner', () => {
    expect(hasRole(WorkspaceRole.Admin, WorkspaceRole.Owner)).toBe(false);
    expect(hasRole(WorkspaceRole.Admin, WorkspaceRole.Admin)).toBe(true);
    expect(hasRole(WorkspaceRole.Admin, WorkspaceRole.Manager)).toBe(true);
    expect(hasRole(WorkspaceRole.Admin, WorkspaceRole.ReadOnly)).toBe(true);
  });

  it('manager meets manager/read_only but not admin/owner', () => {
    expect(hasRole(WorkspaceRole.Manager, WorkspaceRole.Owner)).toBe(false);
    expect(hasRole(WorkspaceRole.Manager, WorkspaceRole.Admin)).toBe(false);
    expect(hasRole(WorkspaceRole.Manager, WorkspaceRole.Manager)).toBe(true);
    expect(hasRole(WorkspaceRole.Manager, WorkspaceRole.ReadOnly)).toBe(true);
  });

  it('read_only only meets read_only', () => {
    expect(hasRole(WorkspaceRole.ReadOnly, WorkspaceRole.Owner)).toBe(false);
    expect(hasRole(WorkspaceRole.ReadOnly, WorkspaceRole.Admin)).toBe(false);
    expect(hasRole(WorkspaceRole.ReadOnly, WorkspaceRole.Manager)).toBe(false);
    expect(hasRole(WorkspaceRole.ReadOnly, WorkspaceRole.ReadOnly)).toBe(true);
  });
});

describe('requireRole', () => {
  it('passes the access through when role is sufficient', () => {
    const access = makeAccess(WorkspaceRole.Admin);
    const result = requireRole(access, WorkspaceRole.Manager);
    expect(result).toBe(access);
  });

  it('returns a 403 Response when role is insufficient', async () => {
    const access = makeAccess(WorkspaceRole.ReadOnly);
    const result = requireRole(access, WorkspaceRole.Manager);
    expect(result).toBeInstanceOf(Response);
    const body = await (result as Response).json();
    expect((result as Response).status).toBe(403);
    expect(body.error).toMatch(/manager/);
  });

  it('allows exactly-matched role', () => {
    const access = makeAccess(WorkspaceRole.Owner);
    const result = requireRole(access, WorkspaceRole.Owner);
    expect(result).toBe(access);
  });

  it('blocks admin from owner-only actions', async () => {
    const access = makeAccess(WorkspaceRole.Admin);
    const result = requireRole(access, WorkspaceRole.Owner);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });
});
