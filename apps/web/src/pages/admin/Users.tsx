import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { ApprovalStatus, Role, User } from '../../lib/types';
import {
  Avatar, Badge, Banner, Button, Card, CardHead, ConfirmDialog, DataTable, Drawer,
  EmptyState, Menu, MenuItem, MenuSep, PageHeader, Segmented, Stat, StatGrid,
  useToast, type Column,
} from '../../components/ui';
import {
  IconCheck, IconClose, IconMail, IconMore, IconTrash, IconUser, IconUsers,
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
      key: 'role', header: 'Role', width: '120px', sortValue: (u) => u.role,
      cell: (u) => <Badge tone={ROLE_TONE[u.role]}>{u.role[0] + u.role.slice(1).toLowerCase()}</Badge>,
    },
    {
      key: 'status', header: 'Status', width: '130px', sortValue: (u) => u.approvalStatus ?? '',
      cell: (u) => u.approvalStatus
        ? <Badge tone={STATUS_TONE[u.approvalStatus]} dot>{u.approvalStatus[0] + u.approvalStatus.slice(1).toLowerCase()}</Badge>
        : <span className="t-muted">—</span>,
    },
    {
      key: 'department', header: 'Department', sortValue: (u) => u.department ?? '',
      cell: (u) => u.department ?? <span className="t-muted">Not set</span>,
    },
    {
      key: 'joined', header: 'Joined', width: '140px', sortValue: (u) => u.createdAt ?? '',
      cell: (u) => <span className="t-muted">{relativeTime(u.createdAt)}</span>,
    },
    {
      key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', width: '64px',
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

  return (
    <>
      <PageHeader
        eyebrow="Management"
        title="People"
        lede="Every account on the platform. Approve teachers, review details and remove accounts."
      />

      {capped && (
        <Banner tone="info" title="Showing the first 200 accounts">
          This view is capped by the server. Narrow it with the role or status filters to be
          certain you are seeing everyone you are looking for.
        </Banner>
      )}

      <StatGrid>
        <Stat label="Accounts shown" value={rows.length} foot="Matching the current filter" />
        <Stat label="Students" value={counts.students} foot="In this view" />
        <Stat label="Teachers" value={counts.teachers} foot="In this view" />
        <Stat label="Pending review" value={counts.pending} foot={counts.pending ? 'Cannot sign in yet' : 'All reviewed'} />
      </StatGrid>

      <div className="section">
        <Card className="card-flush">
          <CardHead title="All accounts" sub="Search, filter and act on any account" />
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
            pageSize={12}
            mobileCard={(u) => (
              <button type="button" className="record" style={{ width: '100%', textAlign: 'left' }} onClick={() => setDetail(u)}>
                <Avatar name={u.name} size="sm" />
                <div className="record-main">
                  <div className="record-title">{u.name}</div>
                  <div className="record-meta">{u.email}</div>
                </div>
                <Badge tone={ROLE_TONE[u.role]}>{u.role[0] + u.role.slice(1).toLowerCase()}</Badge>
              </button>
            )}
            empty={
              <EmptyState
                icon={<IconUsers size={20} />}
                title="No accounts match these filters"
                description="Try a different role or status — or clear the filters to see everyone on the platform."
                action={<Button size="sm" variant="secondary" onClick={() => { setRole('ALL'); setStatus('ALL'); }}>Clear filters</Button>}
              />
            }
          />
        </Card>
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
              <Avatar name={detail.name} size="xl" />
              <div>
                <h3>{detail.name}</h3>
                <p className="row-tight t-sm"><IconMail size={14} />{detail.email}</p>
              </div>
            </div>

            <dl className="detail-list">
              <div><dt>Role</dt><dd><Badge tone={ROLE_TONE[detail.role]}>{detail.role[0] + detail.role.slice(1).toLowerCase()}</Badge></dd></div>
              <div>
                <dt>Status</dt>
                <dd>
                  {detail.approvalStatus
                    ? <Badge tone={STATUS_TONE[detail.approvalStatus]} dot>{detail.approvalStatus[0] + detail.approvalStatus.slice(1).toLowerCase()}</Badge>
                    : '—'}
                </dd>
              </div>
              <div><dt>Department</dt><dd>{detail.department ?? 'Not set'}</dd></div>
              <div><dt>Year</dt><dd>{detail.year ? `Year ${detail.year}` : '—'}</dd></div>
              <div><dt>Joined</dt><dd>{formatDate(detail.createdAt)}</dd></div>
              <div><dt>Account ID</dt><dd className="mono t-caption">{detail.id}</dd></div>
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
