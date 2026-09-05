import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { ApprovalStatus, User } from '../../lib/types';
import {
  Avatar, Badge, Button, Card, CardHead, DataTable, EmptyState, PageHeader,
  useToast, type Column,
} from '../../components/ui';
import { IconCheck, IconCheckCircle, IconClose, IconMail } from '../../components/icons';
import { formatDate, relativeTime } from '../../lib/format';

/* ============================================================
   Approvals
   A queue, not a table of everything: only the accounts that
   are blocked, with the two decisions that unblock them.
   ============================================================ */
export default function AdminApprovals() {
  const qc = useQueryClient();
  const toast = useToast();

  const pending = useQuery({
    queryKey: ['users', 'pending'],
    queryFn: () => api.get<User[]>('/users?role=TEACHER&status=PENDING'),
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; approvalStatus: ApprovalStatus }) =>
      api.patch(`/users/${v.id}/approval`, { approvalStatus: v.approvalStatus }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success(
        v.approvalStatus === 'APPROVED' ? 'Teacher approved' : 'Application rejected',
        v.approvalStatus === 'APPROVED' ? 'They can sign in and run sessions now.' : undefined,
      );
    },
    onError: () => toast.error('Could not update that account'),
  });

  const columns: Column<User>[] = [
    {
      key: 'name', header: 'Applicant', sortValue: (u) => u.name,
      cell: (u) => (
        <span className="row-tight">
          <Avatar name={u.name} size="sm" />
          <span>
            <span className="cell-primary">{u.name}</span>
            <span className="cell-sub">{u.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'department', header: 'Department', sortValue: (u) => u.department ?? '',
      cell: (u) => u.department ?? <span className="t-muted">Not stated</span>,
    },
    {
      key: 'applied', header: 'Applied', width: '160px', sortValue: (u) => u.createdAt ?? '',
      cell: (u) => <span title={formatDate(u.createdAt)}>{relativeTime(u.createdAt)}</span>,
    },
    {
      key: 'actions', header: <span className="sr-only">Decision</span>, align: 'right', width: '200px',
      cell: (u) => (
        <span className="row-tight" style={{ justifyContent: 'flex-end' }}>
          <Button size="xs" variant="danger" onClick={() => decide.mutate({ id: u.id, approvalStatus: 'REJECTED' })}>
            <IconClose size={13} />Reject
          </Button>
          <Button size="xs" onClick={() => decide.mutate({ id: u.id, approvalStatus: 'APPROVED' })}>
            <IconCheck size={13} />Approve
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Management"
        title="Teacher approvals"
        lede="Teaching accounts cannot sign in until an administrator approves them. Reviewing promptly keeps classes running."
      />

      <Card className="card-flush">
        <CardHead
          title="Waiting for review"
          sub="Newest applications first"
          action={pending.data?.length ? <Badge tone="warning">{pending.data.length} waiting</Badge> : undefined}
        />
        <DataTable
          rows={pending.data}
          columns={columns}
          getRowId={(u) => u.id}
          loading={pending.isLoading}
          error={pending.isError || undefined}
          onRetry={() => void pending.refetch()}
          caption="Teaching accounts awaiting approval"
          search={{ placeholder: 'Search applicants', match: (u) => `${u.name} ${u.email} ${u.department ?? ''}` }}
          selectable
          bulkActions={(ids, clear) => (
            <>
              <Button size="xs" onClick={() => { ids.forEach((id) => decide.mutate({ id, approvalStatus: 'APPROVED' })); clear(); }}>
                <IconCheck size={13} />Approve selected
              </Button>
              <Button size="xs" variant="danger" onClick={() => { ids.forEach((id) => decide.mutate({ id, approvalStatus: 'REJECTED' })); clear(); }}>
                <IconClose size={13} />Reject selected
              </Button>
            </>
          )}
          pageSize={10}
          mobileCard={(u) => (
            <div className="record" style={{ alignItems: 'flex-start' }}>
              <Avatar name={u.name} size="sm" />
              <div className="record-main">
                <div className="record-title">{u.name}</div>
                <div className="record-meta row-tight"><IconMail size={12} />{u.email}</div>
                <div className="row-tight" style={{ marginTop: 'var(--s-3)' }}>
                  <Button size="xs" onClick={() => decide.mutate({ id: u.id, approvalStatus: 'APPROVED' })}>Approve</Button>
                  <Button size="xs" variant="danger" onClick={() => decide.mutate({ id: u.id, approvalStatus: 'REJECTED' })}>Reject</Button>
                </div>
              </div>
            </div>
          )}
          empty={
            <EmptyState
              icon={<IconCheckCircle size={20} />}
              title="Nothing waiting"
              description="Every teaching account has been reviewed. New applications appear here as soon as someone signs up as a teacher."
            />
          }
        />
      </Card>
    </>
  );
}
