import { CheckCircle2, Eye, Inbox, Mail, Settings, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '@/lib/api';
import type { EmailRow } from '@/lib/types';
import { Badge, Button, Callout, Card, EmptyState, ErrorState, PageHeader, PageLoader, Segmented, Table, Td, Th } from '@/components/ui';
import { Modal } from '@/components/overlays';
import { fmtDate, fmtStamp, fmtTime } from '@/lib/format';

function StatusBadge({ status }: { status: EmailRow['status'] }) {
  if (status === 'sent') return <Badge tone="green" icon={<CheckCircle2 className="size-3" />}>Delivered</Badge>;
  if (status === 'preview') return <Badge tone="violet" icon={<Eye className="size-3" />}>Preview</Badge>;
  return <Badge tone="red" icon={<XCircle className="size-3" />}>Failed</Badge>;
}

export default function Notifications() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'' | 'sent' | 'preview' | 'failed'>('');
  const plan = params.get('plan');
  const qs = new URLSearchParams({ ...(status && { status }), ...(plan && { plan_id: plan }) });
  const { data, isLoading, error, refetch } = useApi<{ items: EmailRow[]; totals: Record<string, number>; smtp_configured: boolean }>(`/emails?${qs}`);
  const [viewId, setViewId] = useState<number | null>(null);
  const view = useApi<EmailRow>(viewId ? `/emails/${viewId}` : null);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const t = data.totals;

  return (
    <div>
      <PageHeader title="Notifications" description="Every duty email sent to teachers, with its delivery status." />
      {!data.smtp_configured && (
        <Callout
          tone="warning"
          className="mb-5"
          icon={<Mail className="size-4" />}
          title="Email delivery is not set up — running in preview mode"
          action={
            <Link to="/settings?tab=email">
              <Button size="sm" icon={<Settings className="size-4" />}>
                Set up email
              </Button>
            </Link>
          }
        >
          Notifications are created and saved here so you can check them, but they are not delivered. Add your college’s SMTP details (e.g. Gmail or Outlook) to send them for real.
        </Callout>
      )}
      <div className="mb-5 grid grid-cols-3 gap-3 sm:max-w-xl">
        {[
          { label: 'Delivered', value: t.sent || 0, tone: 'text-emerald-600' },
          { label: 'Preview only', value: t.preview || 0, tone: 'text-purple-600' },
          { label: 'Failed', value: t.failed || 0, tone: 'text-rose-600' },
        ].map((s) => (
          <Card key={s.label} className="px-4 py-3">
            <div className="text-xs text-muted">{s.label}</div>
            <div className={`text-xl font-semibold tabular ${s.tone}`}>{s.value}</div>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <Segmented
            value={status}
            onChange={setStatus}
            items={[
              { value: '', label: 'All' },
              { value: 'sent', label: 'Delivered' },
              { value: 'preview', label: 'Preview' },
              { value: 'failed', label: 'Failed' },
            ]}
          />
          {plan && (
            <Link to="/notifications" className="text-[13px] font-semibold text-ink underline decoration-mark decoration-2 underline-offset-2 hover:decoration-ink">
              Showing one plan · show all
            </Link>
          )}
        </div>
        {!data.items.length ? (
          <EmptyState icon={<Inbox className="size-6" />} title="No emails yet" description="Approve a seating plan and click “Notify teachers” to send duty emails." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Recipient</Th>
                <Th>Exam</Th>
                <Th>Status</Th>
                <Th>Sent</Th>
                <Th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id} className="hover:bg-subtle/50">
                  <Td>
                    <div className="font-medium">{e.to_name}</div>
                    <div className="text-xs text-muted">{e.to_email || 'No email address'}</div>
                  </Td>
                  <Td>
                    <div className="text-[13px]">{e.exam_name || '—'}</div>
                    {e.date && (
                      <div className="text-xs text-muted">
                        {fmtDate(e.date, 'short')} · {fmtTime(e.start_time)}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={e.status} />
                    {e.error && <div className="mt-1 max-w-xs truncate text-xs text-rose-600" title={e.error}>{e.error}</div>}
                  </Td>
                  <Td className="whitespace-nowrap text-[13px] text-muted">{fmtStamp(e.created_at)}</Td>
                  <Td>
                    <Button size="xs" variant="ghost" icon={<Eye className="size-3.5" />} onClick={() => setViewId(e.id)}>
                      View
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Modal open={!!viewId} onClose={() => setViewId(null)} size="lg" title={view.data?.subject || 'Email'} description={view.data ? `To ${view.data.to_name} <${view.data.to_email || 'no address'}>` : undefined}>
        {view.data?.body_html ? (
          <iframe title="Email preview" srcDoc={view.data.body_html} sandbox="" className="h-[60vh] w-full rounded-xl border border-line bg-white" />
        ) : (
          <PageLoader />
        )}
      </Modal>
    </div>
  );
}
