import { BookOpen, GraduationCap, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { http, useAction, useApi } from '@/lib/api';
import type { Course } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, PageLoader, SearchInput, Table, Td, Th } from '@/components/ui';
import { Modal, useConfirm, useToast } from '@/components/overlays';
import { plural } from '@/lib/format';

interface CourseForm {
  id?: number;
  code: string;
  name: string;
  department: string;
}

function CourseEditor({ open, onClose, course, departments }: { open: boolean; onClose: () => void; course: Course | null; departments: string[] }) {
  const toast = useToast();
  const [f, setF] = useState<CourseForm>({ code: '', name: '', department: '' });
  useEffect(() => {
    if (open) setF(course ? { id: course.id, code: course.code, name: course.name, department: course.department || '' } : { code: '', name: '', department: '' });
  }, [open, course]);
  const save = useAction((b: CourseForm) => (b.id ? http.put(`/courses/${b.id}`, b) : http.post('/courses', b)));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={course ? `Edit ${course.code}` : 'Add a course'}
      description="A course (programme) groups students. Students of the same course and semester are never seated side by side."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!f.code || !f.name}
            loading={save.isPending}
            onClick={() =>
              save.mutate(f, {
                onSuccess: () => {
                  toast.success(course ? 'Course updated' : 'Course added');
                  onClose();
                },
                onError: (e) => toast.error('Could not save course', e.message),
              })
            }
          >
            {course ? 'Save changes' : 'Add course'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <Field label="Code" required hint="Short, e.g. BCA">
          <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} maxLength={24} />
        </Field>
        <Field label="Full name" required>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Bachelor of Computer Applications" />
        </Field>
        <Field label="Department" className="sm:col-span-2" hint="Used to avoid assigning teachers to invigilate their own department’s students.">
          <Input list="departments" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} />
          <datalist id="departments">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Field>
      </div>
    </Modal>
  );
}

export default function Courses() {
  const { data, isLoading, error, refetch } = useApi<Course[]>('/courses');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Course | null | undefined>(undefined);
  const del = useAction((id: number) => http.del(`/courses/${id}`));
  const toast = useToast();
  const confirm = useConfirm();
  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const departments = [...new Set(data!.map((c) => c.department).filter(Boolean) as string[])].sort();
  const filtered = data!.filter((c) => `${c.code} ${c.name} ${c.department}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Courses"
        description={`${plural(data!.length, 'course')} · ${data!.reduce((n, c) => n + c.student_count, 0).toLocaleString()} students`}
        actions={
          <>
            <Link to="/students?import=1">
              <Button icon={<Upload className="size-4" />}>Import students</Button>
            </Link>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit(null)}>
              Add course
            </Button>
          </>
        }
      />
      {!data!.length ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="size-6" />}
            title="No courses yet"
            description="Courses are created automatically when you import students, or you can add them here."
            action={
              <>
                <Link to="/students?import=1">
                  <Button variant="primary" icon={<Upload className="size-4" />}>Import students</Button>
                </Link>
                <Button onClick={() => setEdit(null)}>Add course</Button>
              </>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="border-b border-line p-4">
            <SearchInput value={q} onChange={setQ} placeholder="Search courses…" className="sm:w-80" />
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Course</Th>
                <Th>Department</Th>
                <Th>Students by semester</Th>
                <Th className="text-right">Total</Th>
                <Th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-subtle/50">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Badge tone="indigo">{c.code}</Badge>
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </Td>
                  <Td className="text-muted">{c.department || '—'}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {c.semesters.length ? (
                        c.semesters.map((s) => (
                          <Link key={s.semester ?? 'none'} to={`/students?course=${c.id}`} className="rounded-md bg-subtle px-2 py-0.5 text-xs text-muted hover:text-fg">
                            {s.semester ? `Sem ${s.semester}` : 'No sem'} · <span className="font-semibold text-fg tabular">{s.count}</span>
                          </Link>
                        ))
                      ) : (
                        <span className="text-xs text-muted">No students</span>
                      )}
                    </div>
                  </Td>
                  <Td className="text-right font-semibold tabular">{c.student_count.toLocaleString()}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Link to={`/students?course=${c.id}`} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-fg" title="View students">
                        <GraduationCap className="size-4" />
                      </Link>
                      <button onClick={() => setEdit(c)} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-fg" title="Edit">
                        <Pencil className="size-4" />
                      </button>
                      <button
                        className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600"
                        title="Delete"
                        onClick={async () => {
                          if (
                            !(await confirm({
                              title: `Delete ${c.code}?`,
                              message: c.student_count ? `This also deletes its ${plural(c.student_count, 'student')}.` : 'This cannot be undone.',
                              confirmLabel: 'Delete course',
                              tone: 'danger',
                              typeToConfirm: c.student_count ? c.code : undefined,
                            }))
                          )
                            return;
                          del.mutate(c.id, { onSuccess: () => toast.success('Course deleted'), onError: (e) => toast.error('Cannot delete course', e.message) });
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <CourseEditor open={edit !== undefined} onClose={() => setEdit(undefined)} course={edit ?? null} departments={departments} />
    </div>
  );
}
