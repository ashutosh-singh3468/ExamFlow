import { lazy, Suspense, type ReactNode } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import AppShell from './components/AppShell';
import { Button, PageLoader } from './components/ui';
import Login from './pages/Login';
import ForcePasswordChange from './pages/ForcePasswordChange';

const FindSeat = lazy(() => import('./pages/FindSeat'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Schedule = lazy(() => import('./pages/admin/Schedule'));
const Plans = lazy(() => import('./pages/admin/Plans'));
const PlanWizard = lazy(() => import('./pages/admin/PlanWizard'));
const PlanEditor = lazy(() => import('./pages/admin/PlanEditor'));
const Classrooms = lazy(() => import('./pages/admin/Classrooms'));
const Courses = lazy(() => import('./pages/admin/Courses'));
const Students = lazy(() => import('./pages/admin/Students'));
const Teachers = lazy(() => import('./pages/admin/Teachers'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Notifications = lazy(() => import('./pages/admin/Notifications'));
const SettingsPage = lazy(() => import('./pages/admin/Settings'));
const MyDuties = lazy(() => import('./pages/teacher/MyDuties'));
const DutyRoom = lazy(() => import('./pages/teacher/DutyRoom'));
const Availability = lazy(() => import('./pages/teacher/Availability'));
const Account = lazy(() => import('./pages/Account'));

function RequireAuth() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <PageLoader label="Starting ExamFlow…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (user.must_change_password) return <ForcePasswordChange />;
  return <Outlet />;
}

function RequireRole({ role }: { role: 'admin' | 'teacher' }) {
  const { user } = useAuth();
  if (user?.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'teacher' ? '/my/duties' : '/dashboard'} replace />;
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="font-display text-7xl font-semibold text-ink">404</div>
      <div className="text-lg font-semibold">Page not found</div>
      <p className="text-sm text-muted">The page you are looking for doesn’t exist or has moved.</p>
      <Link to="/">
        <Button variant="primary">Go home</Button>
      </Link>
    </div>
  );
}

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<PageLoader />}>{children}</Suspense>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/find-seat"
        element={
          <S>
            <FindSeat />
          </S>
        }
      />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route element={<RequireRole role="admin" />}>
            <Route path="/dashboard" element={<S><Dashboard /></S>} />
            <Route path="/schedule" element={<S><Schedule /></S>} />
            <Route path="/plans" element={<S><Plans /></S>} />
            <Route path="/plans/new" element={<S><PlanWizard /></S>} />
            <Route path="/plans/:id" element={<S><PlanEditor /></S>} />
            <Route path="/classrooms" element={<S><Classrooms /></S>} />
            <Route path="/courses" element={<S><Courses /></S>} />
            <Route path="/students" element={<S><Students /></S>} />
            <Route path="/teachers" element={<S><Teachers /></S>} />
            <Route path="/reports" element={<S><Reports /></S>} />
            <Route path="/notifications" element={<S><Notifications /></S>} />
            <Route path="/settings" element={<S><SettingsPage /></S>} />
          </Route>
          <Route element={<RequireRole role="teacher" />}>
            <Route path="/my/duties" element={<S><MyDuties /></S>} />
            <Route path="/my/duties/:planId" element={<S><DutyRoom /></S>} />
            <Route path="/my/availability" element={<S><Availability /></S>} />
          </Route>
          <Route path="/account" element={<S><Account /></S>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
