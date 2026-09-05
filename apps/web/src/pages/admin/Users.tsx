import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { downloadCsv } from '../../lib/csv';
import type { ApprovalStatus, Role, User } from '../../lib/types';
import {
  Avatar, Badge, Banner, Button, ConfirmDialog, DataTable, Drawer,
  EmptyState, Menu, MenuItem, MenuSep, PageHeader, Segmented,
  useToast, type Column,
} from '../../components/ui';
import {
  IconCheck, IconClose, IconMore, IconTrash, IconUser, IconUsers,
} from '../../components/icons';
import { formatDate, relativeTime } from '../../lib/format';

/* ============================================================
   People
   The operational table: search, filter by role and status,
   sort, page, select and act. Row actions stay quiet until a
   row is hovered or focused.
   ============================================================ */

const ROLE_TONE = { STUDENT: 'info', TEACHER: 'accent', ADMIN: 'solid' } as const;
const STATUS_TONE = { APPROVED: 'success', PENDING: 'warning', REJECTED: 'danger' } as const;

function titleCase(s: string) { return s[0] + s.slice(1).toLowerCase(); }

export default function AdminUsers() {
  const qc = useQueryClient();
  const toast = useToast();

  const [role, setRole] = useState<'ALL' | Role>('ALL');
  const [status, setStatus] = useState<'ALL' | ApprovalStatus>('ALL');
  const [detail, setDetail] = useState<User | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);

  const params = new URLSearchParams();
  if (role !== 'ALL') params.set('role', role);
  if (status !== 'ALL') params.set('status', status);
  params.set('take', '200');
  const qs = params.toString();

  const users = useQuery({
    queryKey: ['users', role, status],
    queryFn: () => api.get<User[]>(`/users?${qs}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
  };

  const setApproval = useMutation({
    mutationFn: (v: { id: string; approvalStatus: ApprovalStatus }) =>
      api.patch(`/users/${v.id}/approval`, { approvalStatus: v.approvalStatus }),
    onSuccess: (_d, v) => {
      invalidate();
      toast.success(v.approvalStatus === 'APPROVED' ? 'Account approved' : 'Account rejected');
    },
    onError: () => toast.error('Could not update that account'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/users/${id}`),
    onSuccess: () => {
      setRemoving(null); setDetail(null); invalidate();
      toast.success('Account deleted');
    },
    onError: () => { setRemoving(null); toast.error('Could not delete that account'); },
  });

  const rows = users.data ?? [];
  // The API caps a listing at 200 rows. Say so rather than quietly
  // showing a partial list as if it were the whole platform.
  const capped = rows.length >= 200;
  const counts = {
    students: rows.filter((u) => u.role === 'STUDENT').length,
    teachers: rows.filter((u) => u.role === 'TEACHER').length,
    pending: rows.filter((u) => u.approvalStatus === 'PENDING').length,
  };

  const columns: Column<User>[] = [
    {
      key: 'name', header: 'Name', sortValue: (u) => u.name,
      cell: (u) => (
        <button type="button" className="cell-user" onClick={() => setDetail(u)}>
          <Avatar name={u.name} size="sm" />
          <span>
            <span className="cell-primary">{u.name}</span>
            <span className="cell-sub">{u.email}</span>
          </span>
        </button>
      ),
    },
    {
      key: 'role', header: 'Role', width: 110, sortValue: (u) => u.role,
      cell: (u) => <Badge tone={ROLE_TONE[u.role]}>{titleCase(u.role)}</Badge>,
    },
    {
      key: 'status', header: 'Status', width: 120, sortValue: (u) => u.approvalStatus ?? '',
      cell: (u) => u.approvalStatus
        ? <Badge tone={STATUS_TONE[u.approvalStatus]} dot>{titleCase(u.approvalStatus)}</Badge>
        : <span className="cell-muted">—</span>,
    },
    {
      key: 'department', header: 'Department', sortValue: (u) => u.department ?? '', secondary: true,
      cell: (u) => u.department ?? <span className="cell-muted">Not set</span>,
    },
    {
      key: 'joined', header: 'Joined', width: 130, sortValue: (u) => u.createdAt ?? '',
      cell: (u) => <span className="cell-muted" title={formatDate(u.createdAt)}>{relativeTime(u.createdAt)}</span>,
    },
    {
      key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', width: 56,
      cell: (u) => (
        <Menu label={`Actions for ${u.name}`} trigger={<IconMore size={16} />}>
          {(close) => (
            <>
              <MenuItem icon={<IconUser size={15} />} onClick={() => { close(); setDetail(u); }}>
                View details
              </MenuItem>
              {u.role === 'TEACHER' && u.approvalStatus !== 'APPROVED' && (
                <MenuItem icon={<IconCheck size={15} />} onClick={() => { close(); setApproval.mutate({ id: u.id, approvalStatus: 'APPROVED' }); }}>
                  Approve account
                </MenuItem>
              )}
              {u.role === 'TEACHER' && u.approvalStatus === 'APPROVED' && (
                <MenuItem icon={<IconClose size={15} />} onClick={() => { close(); setApproval.mutate({ id: u.id, approvalStatus: 'REJECTED' }); }}>
                  Revoke access
                </MenuItem>
              )}
              <MenuSep />
              <MenuItem danger icon={<IconTrash size={15} />} onClick={() => { close(); setRemoving(u); }}>
                Delete account
              </MenuItem>
            </>
          )}
        </Menu>
      ),
    },
  ];

  const summary = users.isError
    ? 'Could not load accounts.'
    : users.isLoading
      ? 'Loading accounts…'
      : `${rows.length} ${rows.length === 1 ? 'account' : 'accounts'} · ${counts.students} students · ${counts.teachers} teachers${counts.pending ? ` · ${counts.pending} pending review` : ''}`;

  return (
    <>
      <PageHeader
        title="People"
        lede={summary}
        actions={
          <Button
            variant="secondary"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv('sessionhub-accounts.csv', [
                ['Name', 'Email', 'Role', 'Status', 'Department', 'Joined'],
                ...rows.map((u) => [
                  u.name,
                  u.email,
                  u.role,
                  u.approvalStatus ?? '',
                  u.department ?? '',
                  u.createdAt ? u.createdAt.slice(0, 10) : '',
                ]),
              ])
            }
          >
            Export CSV
          </Button>
        }
      />

      {capped && (
        <Banner tone="info" title="Showing the first 200 accounts">
          Narrow the list with the role or status filters to be certain you are seeing everyone.
        </Banner>
      )}

      <div className="table-frame">
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(u) => u.id}
          loading={users.isLoading}
          error={users.isError || undefined}
          onRetry={() => void users.refetch()}
          caption="Platform accounts"
          search={{ placeholder: 'Search name, email or department', match: (u) => `${u.name} ${u.email} ${u.department ?? ''}` }}
          toolbar={
            <>
              <Segmented
                label="Filter by role"
                value={role}
                onChange={setRole}
                options={[
                  { value: 'ALL', label: 'All' },
                  { value: 'STUDENT', label: 'Students' },
                  { value: 'TEACHER', label: 'Teachers' },
                  { value: 'ADMIN', label: 'Admins' },
                ]}
              />
              <Segmented
                label="Filter by status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'ALL', label: 'Any status' },
                  { value: 'APPROVED', label: 'Approved' },
                  { value: 'PENDING', label: 'Pending' },
                ]}
              />
            </>
          }
          selectable
          bulkActions={(ids, clear) => (
            <>
              <Button
                size="xs"
                onClick={() => {
                  ids.forEach((id) => setApproval.mutate({ id, approvalStatus: 'APPROVED' }));
                  clear();
                }}
              >
                <IconCheck size={13} />Approve
              </Button>
              <Button
                size="xs"
                variant="danger"
                onClick={() => {
                  ids.forEach((id) => setApproval.mutate({ id, approvalStatus: 'REJECTED' }));
                  clear();
                }}
              >
                <IconClose size={13} />Reject
              </Button>
            </>
          )}
          pageSize={15}
          mobileCard={(u) => (
            <button type="button" className="record" style={{ width: '100%', textAlign: 'left' }} onClick={() => setDetail(u)}>
              <Avatar name={u.name} size="sm" />
              <div className="record-main">
                <div className="record-title">{u.name}</div>
                <div className="record-meta">{u.email}</div>
              </div>
              <Badge tone={ROLE_TONE[u.role]}>{titleCase(u.role)}</Badge>
            </button>
          )}
          empty={
            <EmptyState
              icon={<IconUsers size={18} />}
              title="No accounts match these filters"
              description="Try a different role or status, or clear the filters to see everyone on the platform."
              action={<Button size="sm" variant="secondary" onClick={() => { setRole('ALL'); setStatus('ALL'); }}>Clear filters</Button>}
            />
          }
        />
      </div>

      {/* ── Detail drawer ─────────────────────────────── */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name ?? 'Account'}
        description={detail?.email}
        footer={
          detail?.role === 'TEACHER' && detail.approvalStatus !== 'APPROVED' ? (
            <>
              <Button variant="danger" onClick={() => { setApproval.mutate({ id: detail.id, approvalStatus: 'REJECTED' }); setDetail(null); }}>
                Reject
              </Button>
              <Button onClick={() => { setApproval.mutate({ id: detail.id, approvalStatus: 'APPROVED' }); setDetail(null); }}>
                Approve account
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>
          )
        }
      >
        {detail && (
          <>
            <div className="drawer-identity">
              <Avatar name={detail.name} size="lg" />
              <div>
                <div className="t-sm" style={{ fontWeight: 500, color: 'var(--text)' }}>{detail.name}</div>
                <div className="t-caption t-muted">{detail.email}</div>
              </div>
            </div>

            <dl className="kv">
              <div><dt>Role</dt><dd><Badge tone={ROLE_TONE[detail.role]}>{titleCase(detail.role)}</Badge></dd></div>
              <div>
                <dt>Status</dt>
                <dd>
                  {detail.approvalStatus
                    ? <Badge tone={STATUS_TONE[detail.approvalStatus]} dot>{titleCase(detail.approvalStatus)}</Badge>
                    : '—'}
                </dd>
              </div>
              <div><dt>Department</dt><dd>{detail.department ?? 'Not set'}</dd></div>
              <div><dt>Year</dt><dd>{detail.year ? `Year ${detail.year}` : '—'}</dd></div>
              <div><dt>Joined</dt><dd>{formatDate(detail.createdAt)}</dd></div>
              <div><dt>Account ID</dt><dd className="t-data" style={{ fontWeight: 400 }}>{detail.id}</dd></div>
            </dl>

            <div className="drawer-danger">
              <div className="grow">
                <strong className="t-sm">Delete this account</strong>
                <p className="t-caption t-muted">Permanent. Enrolments, answers and attendance are removed with it.</p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setRemoving(detail)}>
                <IconTrash size={14} />Delete
              </Button>
            </div>
          </>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        title={`Delete ${removing?.name ?? 'this account'}?`}
        description="This cannot be undone. The account, its enrolments and its recorded answers are permanently removed."
        confirmLabel="Delete account"
        destructive
        loading={remove.isPending}
      />
    </>
  );
}
