<template>
  <div class="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]" style="height: calc(100vh - 220px); min-height: 520px;">
    <aside class="panel flex min-h-0 flex-col overflow-hidden p-0">
      <div class="border-b px-5 py-5" style="border-color: rgba(17,17,17,0.06);">
        <div class="page-kicker">Platform</div>
        <h2 class="section-title mt-3">All workspaces</h2>
        <p class="section-copy mt-2">Create workspaces and manage their members.</p>
        <button type="button" class="button-primary mt-4 w-full" @click="openCreate">+ New workspace</button>
      </div>
      <div class="flex-1 overflow-y-auto px-3 py-3">
        <div v-if="listLoading" class="space-y-2 p-1">
          <div v-for="i in 5" :key="i" class="skeleton-row"></div>
        </div>
        <div v-else-if="workspaces.length === 0" class="empty-state min-h-full">
          No workspaces yet.
        </div>
        <div v-else class="space-y-2">
          <button
            v-for="ws in workspaces"
            :key="ws.id"
            type="button"
            class="list-card text-left"
            :class="selected?.id === ws.id ? 'list-card-active' : ''"
            @click="select(ws)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="text-sm font-semibold text-slate-900 truncate">{{ ws.name }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ ws.member_count }} {{ ws.member_count === 1 ? 'member' : 'members' }}</div>
                <div v-if="ws.deleted_at" class="mt-1 text-[11px] text-rose-500">Deleted</div>
              </div>
              <span class="shrink-0 text-[11px] uppercase tracking-wide text-slate-400">{{ ws.status }}</span>
            </div>
          </button>
        </div>
      </div>
    </aside>

    <section class="panel flex min-h-0 flex-col overflow-hidden p-0">
      <div v-if="!selected && !creating" class="empty-state flex-1">
        Select a workspace to manage its members, or create a new one.
      </div>

      <div v-else-if="creating" class="flex-1 overflow-y-auto p-6 space-y-4">
        <h3 class="section-title">New workspace</h3>
        <div>
          <label class="form-label">Name</label>
          <input v-model="createForm.name" type="text" class="input" placeholder="Acme Agency" />
        </div>
        <div>
          <label class="form-label">Owner email</label>
          <input v-model="createForm.ownerEmail" type="email" class="input" placeholder="owner@example.com" />
          <p class="help-text mt-1">The user must have signed in at least once.</p>
        </div>
        <div v-if="createError" class="feedback-error">{{ createError }}</div>
        <div class="flex gap-2">
          <button type="button" class="button-primary" :disabled="createBusy" @click="submitCreate">
            {{ createBusy ? 'Creating...' : 'Create workspace' }}
          </button>
          <button type="button" class="button-secondary" @click="creating = false">Cancel</button>
        </div>
      </div>

      <div v-else-if="selected" class="flex-1 overflow-y-auto p-6 space-y-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="page-kicker">Workspace</div>
            <h3 class="section-title mt-2">{{ selected.name }}</h3>
            <p class="section-copy mt-1 text-xs">{{ selected.slug }}</p>
          </div>
          <div class="flex gap-2">
            <button type="button" class="button-secondary" @click="startRename">Rename</button>
            <button type="button" class="button-danger" :disabled="selected.deleted_at" @click="deleteWorkspace">
              {{ selected.deleted_at ? 'Deleted' : 'Delete' }}
            </button>
          </div>
        </div>

        <div v-if="renaming" class="panel-inset space-y-3">
          <label class="form-label">New name</label>
          <input v-model="renameValue" type="text" class="input" />
          <div class="flex gap-2">
            <button type="button" class="button-primary" :disabled="renameBusy" @click="submitRename">
              {{ renameBusy ? 'Saving...' : 'Save' }}
            </button>
            <button type="button" class="button-secondary" @click="renaming = false">Cancel</button>
          </div>
        </div>

        <section>
          <div class="flex items-center justify-between">
            <h4 class="section-subtitle">Members</h4>
            <button type="button" class="button-secondary text-xs" @click="addOpen = !addOpen">
              {{ addOpen ? 'Close' : '+ Add member' }}
            </button>
          </div>

          <div v-if="addOpen" class="panel-inset mt-3 space-y-3">
            <div class="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
              <input v-model="addForm.email" type="email" class="input" placeholder="user@example.com" />
              <select v-model="addForm.role" class="select">
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="read_only">Read-only</option>
              </select>
              <button type="button" class="button-primary" :disabled="addBusy" @click="submitAddMember">
                {{ addBusy ? 'Adding...' : 'Add' }}
              </button>
            </div>
            <div v-if="addError" class="feedback-error">{{ addError }}</div>
          </div>

          <div v-if="membersLoading" class="mt-4 space-y-2">
            <div v-for="i in 3" :key="i" class="skeleton-row"></div>
          </div>

          <table v-else-if="members.length > 0" class="data-table mt-4 w-full">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in members" :key="m.user_id">
                <td>
                  <div class="font-medium">{{ m.full_name || m.email }}</div>
                  <div class="text-xs text-slate-500">{{ m.email }}</div>
                </td>
                <td>
                  <select
                    :value="m.role"
                    class="select"
                    :disabled="rowBusy === m.user_id"
                    @change="onRoleChange(m, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="read_only">Read-only</option>
                  </select>
                </td>
                <td class="text-xs text-slate-500">{{ formatDate(m.created_at) }}</td>
                <td>
                  <button
                    type="button"
                    class="button-danger-subtle"
                    :disabled="rowBusy === m.user_id"
                    @click="removeMember(m)"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-else class="empty-state mt-4 min-h-[120px]">No members yet.</div>

          <div v-if="memberError" class="feedback-error mt-3">{{ memberError }}</div>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  member_count: number;
}

interface MemberRow {
  membership_id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  is_platform_admin: boolean;
}

const API = '/api';

const workspaces = ref<WorkspaceRow[]>([]);
const listLoading = ref(true);
const selected = ref<WorkspaceRow | null>(null);

const creating = ref(false);
const createBusy = ref(false);
const createError = ref('');
const createForm = ref({ name: '', ownerEmail: '' });

const renaming = ref(false);
const renameBusy = ref(false);
const renameValue = ref('');

const members = ref<MemberRow[]>([]);
const membersLoading = ref(false);
const memberError = ref('');
const rowBusy = ref('');

const addOpen = ref(false);
const addBusy = ref(false);
const addError = ref('');
const addForm = ref({ email: '', role: 'manager' });

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

async function loadWorkspaces() {
  listLoading.value = true;
  try {
    const res = await fetch(`${API}/api-admin-workspaces-list`);
    if (!res.ok) return;
    const data = await res.json();
    workspaces.value = data.workspaces ?? [];
  } finally {
    listLoading.value = false;
  }
}

async function loadMembers(workspaceId: string) {
  membersLoading.value = true;
  memberError.value = '';
  try {
    const res = await fetch(`${API}/api-workspace-members-list?workspace_id=${encodeURIComponent(workspaceId)}`);
    const data = await res.json();
    if (!res.ok) {
      memberError.value = data.error ?? 'Failed to load members';
      return;
    }
    members.value = data.members ?? [];
  } catch {
    memberError.value = 'Network error loading members.';
  } finally {
    membersLoading.value = false;
  }
}

function select(ws: WorkspaceRow) {
  selected.value = ws;
  creating.value = false;
  renaming.value = false;
  addOpen.value = false;
  addForm.value = { email: '', role: 'manager' };
  loadMembers(ws.id);
}

function openCreate() {
  selected.value = null;
  creating.value = true;
  createError.value = '';
  createForm.value = { name: '', ownerEmail: '' };
}

async function submitCreate() {
  createError.value = '';
  if (!createForm.value.name.trim() || !createForm.value.ownerEmail.trim()) {
    createError.value = 'Name and owner email are required.';
    return;
  }
  createBusy.value = true;
  try {
    const res = await fetch(`${API}/api-admin-workspaces-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createForm.value.name.trim(),
        owner_email: createForm.value.ownerEmail.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      createError.value = data.error ?? 'Failed to create workspace';
      return;
    }
    await loadWorkspaces();
    creating.value = false;
    const created = workspaces.value.find((w) => w.id === data.workspace.id);
    if (created) select(created);
  } catch {
    createError.value = 'Network error.';
  } finally {
    createBusy.value = false;
  }
}

function startRename() {
  if (!selected.value) return;
  renameValue.value = selected.value.name;
  renaming.value = true;
}

async function submitRename() {
  if (!selected.value) return;
  const name = renameValue.value.trim();
  if (!name) return;
  renameBusy.value = true;
  try {
    const res = await fetch(`${API}/api-admin-workspaces-update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: selected.value.id, name }),
    });
    if (!res.ok) return;
    const data = await res.json();
    selected.value.name = data.workspace.name;
    const row = workspaces.value.find((w) => w.id === selected.value!.id);
    if (row) row.name = data.workspace.name;
    renaming.value = false;
  } finally {
    renameBusy.value = false;
  }
}

async function deleteWorkspace() {
  if (!selected.value) return;
  if (!confirm(`Delete workspace "${selected.value.name}"? This soft-deletes it — contents remain for restore via SQL.`)) return;
  try {
    const res = await fetch(`${API}/api-admin-workspaces-delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: selected.value.id }),
    });
    if (!res.ok) return;
    await loadWorkspaces();
    selected.value = null;
  } catch {
    // ignore
  }
}

async function submitAddMember() {
  if (!selected.value) return;
  addError.value = '';
  if (!addForm.value.email.trim()) {
    addError.value = 'Email is required.';
    return;
  }
  addBusy.value = true;
  try {
    const res = await fetch(`${API}/api-admin-workspace-members-add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: selected.value.id,
        email: addForm.value.email.trim(),
        role: addForm.value.role,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      addError.value = data.error ?? 'Failed to add member';
      return;
    }
    addForm.value = { email: '', role: 'manager' };
    addOpen.value = false;
    await Promise.all([loadMembers(selected.value.id), loadWorkspaces()]);
  } catch {
    addError.value = 'Network error.';
  } finally {
    addBusy.value = false;
  }
}

async function onRoleChange(member: MemberRow, newRole: string) {
  if (!selected.value || newRole === member.role) return;
  rowBusy.value = member.user_id;
  memberError.value = '';
  try {
    const res = await fetch(`${API}/api-admin-workspace-members-update-role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: selected.value.id,
        user_id: member.user_id,
        role: newRole,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      memberError.value = data.error ?? 'Failed to update role';
      return;
    }
    member.role = newRole;
  } catch {
    memberError.value = 'Network error.';
  } finally {
    rowBusy.value = '';
  }
}

async function removeMember(member: MemberRow) {
  if (!selected.value) return;
  if (!confirm(`Remove ${member.email} from ${selected.value.name}?`)) return;
  rowBusy.value = member.user_id;
  memberError.value = '';
  try {
    const res = await fetch(`${API}/api-admin-workspace-members-remove`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: selected.value.id, user_id: member.user_id }),
    });
    const data = await res.json();
    if (!res.ok) {
      memberError.value = data.error ?? 'Failed to remove member';
      return;
    }
    await Promise.all([loadMembers(selected.value.id), loadWorkspaces()]);
  } catch {
    memberError.value = 'Network error.';
  } finally {
    rowBusy.value = '';
  }
}

onMounted(loadWorkspaces);
</script>
