import { Download, GraduationCap, MoreHorizontal, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { http, useAction, useApi } from '@/lib/api';
import type { Course, Student } from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { Menu, MenuItem, Modal, useConfirm, useToast } from '@/components/overlays';
import { ImportWizard } from '@/components/ImportWizard';
import { downloadWorkbook } from '@/lib/excel';
import { plural } from '@/lib/format';

interface StudentForm {
  id?: number;
  roll_no: string;
  name: string;
  course_id: number | '';
  semester: string;
  email: string;
}

function StudentEditor({ open, onClose, student, courses }: { open: boolean; onClose: () => void; student: Student | null; courses: Course[] }) {
  const toast = useToast();
  const [f, setF] = useState<StudentForm>({ roll_no: '', name: '', course_id: '', semester: '', email: '' });
  useEffect(() => {
    if (open)
      setF(
        student
          ? { id: student.id, roll_no: student.roll_no, name: student.name, course_id: student.course_id, semester: student.semester || '', email: student.email || '' }
          : { roll_no: '', name: '', course_id: courses[0]?.id ?? '', semester: '', email: '' },
      );
  }, [open, student, courses]);
  const save = useAction((b: StudentForm) => (b.id ? http.put(`/students/${b.id}`, b) : http.post('/students', b)));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={student ? 'Edit student' : 'Add student'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!f.roll_no || !f.name || !f.course_id}
            onClick={() =>
              save.mutate(f, {
                onSuccess: () => {
                  toast.success(student ? 'Student updated' : 'Student added', `${f.roll_no} · ${f.name}`);
                  onClose();
                },
                onError: (e) => toast.error('Could not save student', e.message),
              })
            }
          >
            {student ? 'Save changes' : 'Add student'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Roll number" required>
          <Input value={f.roll_no} onChange={(e) => setF({ ...f, roll_no: e.target.value })} placeholder="24BCA001" />
        </Field>
        <Field label="Full name" required>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Course" required>
          <Select value={f.course_id} onChange={(e) => setF({ ...f, course_id: Number(e.target.value) })}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Semester">
          <Input value={f.semester} onChange={(e) => setF({ ...f, semester: e.target.value })} placeholder="3" />
        </Field>
        <Field label="Email" className="sm:col-span-2">
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  );
}

export const STUDENT_FIELDS = [
  { key: 'roll_no', label: 'Roll number', required: true, aliases: ['roll', 'rollno', 'roll no', 'enrollment', 'enrolment', 'enrollment no', 'registration', 'reg no', 'regno', 'usn', 'prn', 'admission no'], example: '24BCA001' },
  { key: 'name', label: 'Student name', required: true, aliases: ['name', 'full name', 'student', 'studentname', 'candidate name'], example: 'Priya Sharma' },
  { key: 'course', label: 'Course', required: true, aliases: ['course', 'program', 'programme', 'branch', 'class', 'stream', 'course code', 'degree'], example: 'BCA' },
  { key: 'semester', label: 'Semester', aliases: ['sem', 'semester', 'term', 'year'], example: '3' },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'mail', 'email id'], example: 'priya@college.edu' },
];

export default function Students() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [courseId, setCourseId] = useState(params.get('course') || '');
  const [semester, setSemester] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [edit, setEdit] = useState<Student | null | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [debounced, courseId, semester]);
  useEffect(() => {
    if (params.get('import')) {
      setImporting(true);
      params.delete('import');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const courses = useApi<Course[]>('/courses');
  const qs = new URLSearchParams({ page: String(page), pageSize: '25', ...(debounced && { q: debounced }), ...(courseId && { course_id: courseId }), ...(semester && { semester }) });
  const list = useApi<{ items: Student[]; total: number; page: number; pageSize: number }>(`/students?${qs}`, { placeholderData: (prev) => prev });
  const del = useAction((ids: number[]) => http.post('/students/bulk-delete', { ids }));
  const totalStudents = (courses.data || []).reduce((n, c) => n + c.student_count, 0);
  const course = courses.data?.find((c) => String(c.id) === courseId);

  const exportAll = async () => {
    const all = await http.get<{ items: Student[] }>(`/students?pageSize=all${courseId ? `&course_id=${courseId}` : ''}${semester ? `&semester=${semester}` : ''}`);
    await downloadWorkbook(`students${course ? `-${course.code}` : ''}.xlsx`, [
      { name: 'Students', rows: [['Roll number', 'Student name', 'Course', 'Semester', 'Email'], ...all.items.map((s) => [s.roll_no, s.name, s.course_code, s.semester, s.email])] },
    ]);
  };

  const remove = async (ids: number[]) => {
    if (!(await confirm({ title: `Delete ${plural(ids.length, 'student')}?`, message: 'They will also be removed from any seating plans. This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    del.mutate(ids, {
      onSuccess: () => {
        toast.success(`${plural(ids.length, 'student')} deleted`);
        setSelected(new Set());
      },
    });
  };

  const items = list.data?.items || [];
  const allSelected = items.length > 0 && items.every((s) => selected.has(s.id));

  return (
    <div>
      <PageHeader
        title="Students"
        description={`${totalStudents.toLocaleString()} students across ${plural(courses.data?.length || 0, 'course')}`}
        actions={
          <>
            <Button icon={<Download className="size-4" />} onClick={exportAll} disabled={!totalStudents}>
              Export
            </Button>
            <Button icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>
              Import Excel
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit(null)} disabled={!courses.data?.length}>
              Add student
            </Button>
          </>
        }
      />

      {courses.data && !totalStudents && !list.isLoading ? (
        <Card>
          <EmptyState
            icon={<GraduationCap className="size-6" />}
            title="Upload your student list"
            description="Import an Excel or CSV file with roll number, name, course and semester. Courses are created automatically."
            action={
              <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>
                Import from Excel
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
            <SearchInput value={q} onChange={setQ} placeholder="Search by roll number, name or email…" className="lg:w-80" />
            <Select value={courseId} onChange={(e) => { setCourseId(e.target.value); setSemester(''); }} className="lg:w-64">
              <option value="">All courses</option>
              {courses.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
            {course && course.semesters.length > 1 && (
              <Select value={semester} onChange={(e) => setSemester(e.target.value)} className="lg:w-40">
                <option value="">All semesters</option>
                {course.semesters.map((s) => (
                  <option key={s.semester ?? ''} value={s.semester ?? ''}>
                    Semester {s.semester} ({s.count})
                  </option>
                ))}
              </Select>
            )}
            {selected.size > 0 && (
              <div className="flex items-center gap-2 lg:ml-auto">
                <span className="text-[13px] text-muted">{selected.size} selected</span>
                <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => remove([...selected])}>
                  Delete
                </Button>
              </div>
            )}
          </div>
          <Table>
            <thead>
              <tr>
                <Th className="w-10">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={!allSelected && items.some((s) => selected.has(s.id))}
                    onChange={(v) => setSelected(v ? new Set(items.map((s) => s.id)) : new Set())}
                  />
                </Th>
                <Th>Roll number</Th>
                <Th>Name</Th>
                <Th>Course</Th>
                <Th>Semester</Th>
                <Th>Email</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {list.isLoading &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    <Td colSpan={7}>
                      <Skeleton className="h-5" />
                    </Td>
                  </tr>
                ))}
              {items.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-subtle/50">
                  <Td>
                    <Checkbox
                      checked={selected.has(s.id)}
                      onChange={(v) =>
                        setSelected((prev) => {
                          const n = new Set(prev);
                          if (v) n.add(s.id);
                          else n.delete(s.id);
                          return n;
                        })
                      }
                    />
                  </Td>
                  <Td className="font-medium tabular tracking-wide">{s.roll_no}</Td>
                  <Td className="font-medium">{s.name}</Td>
                  <Td>
                    <Badge tone="indigo">{s.course_code}</Badge>
                  </Td>
                  <Td className="text-muted">{s.semester ? `Sem ${s.semester}` : '—'}</Td>
                  <Td className="text-muted">{s.email || '—'}</Td>
                  <Td>
                    <Menu
                      trigger={({ onClick }) => (
                        <button onClick={onClick} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-fg" aria-label="Student actions">
                          <MoreHorizontal className="size-4" />
                        </button>
                      )}
                      width="w-44"
                    >
                      <MenuItem icon={<Pencil className="size-4" />} onClick={() => setEdit(s)}>
                        Edit
                      </MenuItem>
                      <MenuItem icon={<Trash2 className="size-4" />} danger onClick={() => remove([s.id])}>
                        Delete
                      </MenuItem>
                    </Menu>
                  </Td>
                </tr>
              ))}
              {!list.isLoading && !items.length && (
                <tr>
                  <Td colSpan={7} className="py-12 text-center text-muted">
                    No students match your filters.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
          {list.data && <Pagination page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />}
        </Card>
      )}

      <StudentEditor open={edit !== undefined} onClose={() => setEdit(undefined)} student={edit ?? null} courses={courses.data || []} />
      <ImportWizard
        open={importing}
        onClose={() => setImporting(false)}
        title="Import students"
        entity="Students"
        fields={STUDENT_FIELDS}
        uniqueKey="roll_no"
        endpoint="/students/import"
        templateName="student-template.xlsx"
        templateRows={[
          ['24BCA001', 'Priya Sharma', 'BCA', '3', 'priya.sharma@college.edu'],
          ['24BCA002', 'Rahul Verma', 'BCA', '3', ''],
          ['25BBA001', 'Sneha Iyer', 'BBA', '1', ''],
        ]}
        modes={[
          { value: 'upsert', label: 'Add & update', description: 'New roll numbers are added, existing ones are updated.' },
          { value: 'replace', label: 'Replace everyone', description: 'Deletes all current students first. Use at the start of a term.', danger: true },
        ]}
      />
    </div>
  );
}
