"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, Save, Trash2, UserPlus, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
}

interface PermissionRow {
  code: string;
  area: string;
  description: string;
}

interface StaffRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: "staff" | "admin" | "super_admin";
  role_ids: string[];
}

interface Draft {
  id: string | null;
  code: string;
  name: string;
  description: string;
  permissions: Set<string>;
}

const PROFILE_ROLE_LABEL: Record<StaffRow["role"], string> = {
  super_admin: "Super admin (full access)",
  admin: "Admin (full access except roles)",
  staff: "Staff",
};

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("");

  const fetchAndApply = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/roles");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load roles");
      setRoles(json.roles);
      setPermissions(json.permissions);
      setStaff(json.staff);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  /** Reload after a change. */
  const load = useCallback(async () => {
    setLoading(true);
    await fetchAndApply();
  }, [fetchAndApply]);

  useEffect(() => {
    void fetchAndApply();
  }, [fetchAndApply]);

  const areas = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const p of permissions) map.set(p.area, [...(map.get(p.area) ?? []), p]);
    return [...map.entries()];
  }, [permissions]);

  const editRole = (role: Role | null) =>
    setDraft(
      role
        ? { id: role.id, code: role.code, name: role.name, description: role.description ?? "", permissions: new Set(role.permissions) }
        : { id: null, code: "", name: "", description: "", permissions: new Set() }
    );

  const saveRole = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, permissions: [...draft.permissions] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (role: Role) => {
    if (!confirm(`Delete the role "${role.name}"? Staff who have it lose its permissions.`)) return;
    const res = await fetch(`/api/admin/roles?id=${encodeURIComponent(role.id)}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Could not delete");
    else await load();
  };

  const setStaffRoles = async (body: { user_id?: string; email?: string; role_ids: string[] }) => {
    setError(null);
    const res = await fetch("/api/admin/staff", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Could not save roles");
      return false;
    }
    await load();
    return true;
  };

  const toggleStaffRole = (person: StaffRow, roleId: string) => {
    const next = person.role_ids.includes(roleId)
      ? person.role_ids.filter((r) => r !== roleId)
      : [...person.role_ids, roleId];
    if (person.role === "staff" && next.length === 0 && !confirm("Remove the last role? They go back to a customer account.")) return;
    void setStaffRoles({ user_id: person.id, role_ids: next });
  };

  const addStaff = async () => {
    if (!newStaffEmail.trim() || !newStaffRole) return;
    if (await setStaffRoles({ email: newStaffEmail.trim(), role_ids: [newStaffRole] })) {
      setNewStaffEmail("");
      setNewStaffRole("");
    }
  };

  const draftIsOwner = draft?.code === "owner";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary">Staff &amp; Roles</h1>
          <p className="text-xs text-text-muted mt-1">
            Roles decide what each staff member can do. A person can have more than one role.
          </p>
        </div>
        <button
          type="button"
          onClick={() => editRole(null)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white font-display text-[11px] uppercase tracking-wider font-bold rounded-lg hover:bg-primary-container transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New role
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-badge-discount/40 bg-badge-discount/5 px-3 py-2.5 text-xs text-badge-discount">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Roles */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {roles.map((role) => (
              <div key={role.id} className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-bold text-sm text-on-surface">{role.name}</h2>
                    <p className="text-[11px] text-text-muted">{role.description}</p>
                  </div>
                  {!role.is_system && (
                    <button type="button" onClick={() => deleteRole(role)} className="text-text-muted hover:text-badge-discount" aria-label={`Delete ${role.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-text-muted">
                  {role.permissions.length} of {permissions.length} permissions
                </p>
                <button
                  type="button"
                  onClick={() => editRole(role)}
                  className="self-start text-[11px] font-bold text-primary underline"
                >
                  {role.code === "owner" ? "View permissions" : "Edit permissions"}
                </button>
              </div>
            ))}
          </section>

          {/* Staff */}
          <section className="bg-surface-card border border-border-light rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border-light">
              <h2 className="font-display text-sm uppercase tracking-wider font-bold text-primary">Staff</h2>
              <p className="text-[11px] text-text-muted mt-1">
                To add someone, they first sign up on the site; then enter their email here.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <input
                  type="email"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  placeholder="staff@example.com"
                  className="h-9 px-3 rounded-lg border border-border-light text-xs flex-1"
                />
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-border-light text-xs"
                >
                  <option value="">Choose a role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addStaff}
                  className="inline-flex items-center justify-center gap-2 h-9 px-4 bg-primary text-white text-[11px] font-bold uppercase rounded-lg"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-subtle text-text-muted">
                  <tr>
                    <th className="text-left p-3 font-semibold">Person</th>
                    <th className="text-left p-3 font-semibold">Account</th>
                    {roles.map((r) => (
                      <th key={r.id} className="p-3 font-semibold text-center whitespace-nowrap">
                        {r.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staff.map((person) => (
                    <tr key={person.id} className="border-t border-border-light">
                      <td className="p-3">
                        <div className="font-semibold text-on-surface">{person.full_name || "—"}</div>
                        <div className="text-text-muted">{person.email}</div>
                      </td>
                      <td className="p-3 text-text-muted whitespace-nowrap">{PROFILE_ROLE_LABEL[person.role]}</td>
                      {roles.map((r) => (
                        <td key={r.id} className="p-3 text-center">
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={person.role_ids.includes(r.id)}
                            onChange={() => toggleStaffRole(person, r.id)}
                            aria-label={`${r.name} for ${person.email}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Role editor */}
      {draft && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-surface-card rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-primary">{draft.id ? `Role: ${draft.name}` : "New role"}</h2>
              <button type="button" onClick={() => setDraft(null)} aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-semibold flex flex-col gap-1">
                Name
                <input
                  value={draft.name}
                  disabled={draftIsOwner}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="h-9 px-3 rounded-lg border border-border-light font-normal"
                />
              </label>
              {!draft.id && (
                <label className="text-xs font-semibold flex flex-col gap-1">
                  Code (lowercase, no spaces)
                  <input
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                    placeholder="inventory"
                    className="h-9 px-3 rounded-lg border border-border-light font-normal"
                  />
                </label>
              )}
              <label className="text-xs font-semibold flex flex-col gap-1 sm:col-span-2">
                Description
                <input
                  value={draft.description}
                  disabled={draftIsOwner}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="h-9 px-3 rounded-lg border border-border-light font-normal"
                />
              </label>
            </div>

            {draftIsOwner && (
              <p className="text-[11px] text-text-muted">The Owner role always has every permission.</p>
            )}

            <div className="space-y-3">
              {areas.map(([area, rows]) => (
                <fieldset key={area} className="border border-border-light rounded-lg p-3">
                  <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-text-muted">{area}</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {rows.map((p) => (
                      <label key={p.code} className="flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-primary"
                          disabled={draftIsOwner}
                          checked={draft.permissions.has(p.code)}
                          onChange={() => {
                            const next = new Set(draft.permissions);
                            if (next.has(p.code)) next.delete(p.code);
                            else next.add(p.code);
                            setDraft({ ...draft, permissions: next });
                          }}
                        />
                        <span>{p.description}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>

            {!draftIsOwner && (
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDraft(null)} className="px-4 py-2 text-xs font-bold">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveRole}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save role"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
