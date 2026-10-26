import React from "react";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  Outlet,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  ScanLine,
  Bell,
  Settings,
  LogOut,
  ArrowUpRight,
  Menu,
  X,
  RefreshCw,
} from "lucide-react";
import { api, initials } from "./api";
import { ToastProvider, Logo, Avatar, Loading, ErrorNotice } from "./ui";
import { AuthPage } from "./pages/Auth";
import {
  Dashboard,
  Clients,
  Requests,
  RequestDetail,
  Reminders,
  SettingsPage,
} from "./pages/Workspace";
import { ReviewQueue, ReviewPage } from "./pages/Review";
import { Portal } from "./pages/Portal";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) =>
        error.status !== 401 && error.status !== 404 && count < 1,
      refetchOnWindowFocus: true,
      refetchInterval: false,
      refetchIntervalInBackground: false,
      staleTime: 15000,
    },
  },
});
function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => api("/auth/me"),
    retry: false,
  });
}
const navigation = [
  ["/workspace", "Overview", LayoutDashboard],
  ["/requests", "Requests", ClipboardList],
  ["/clients", "Clients", Users],
  ["/review", "Review queue", ScanLine],
  ["/reminders", "Reminders", Bell],
];
function Layout() {
  const session = useSession(),
    navigate = useNavigate(),
    location = useLocation();
  const [mobile, setMobile] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: () => api("/overview"),
    enabled: !!session.data,
  });
  if (session.isPending) return <Loading />;
  if (session.error?.status === 401) return <Navigate to="/login" replace />;
  if (session.error)
    return <ErrorNotice error={session.error} retry={session.refetch} />;
  const { user, firm } = session.data;
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    queryClient.clear();
    navigate("/login");
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <Logo />
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="firm-switch">
          <span className="firm-initials">{initials(firm.name)}</span>
          <div>
            <strong>{firm.name}</strong>
            <small>Your workspace</small>
          </div>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {navigation.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => setMobile(false)}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{label}</span>
              {path === "/review" && overview.data?.counts.review > 0 && (
                <span className="nav-count">{overview.data.counts.review}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-tag">KEEP REQUESTS MOVING</span>
            <p>Received files stay open until you review them.</p>
            <Link to="/review">
              Open review queue <ArrowUpRight size={14} />
            </Link>
          </div>
          <NavLink className="nav-link" to="/settings">
            <Settings size={18} />
            <span>Firm settings</span>
          </NavLink>
          <button className="account-button" onClick={logout} title="Sign out">
            <Avatar name={user.name} />
            <span>
              <strong>{user.name}</strong>
              <small>
                {user.role === "owner" ? "Firm owner" : "Team member"}
              </small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span className="workspace-breadcrumb">
              Workspace <span>/</span>{" "}
              <strong>
                {location.pathname.startsWith("/review")
                  ? "Review queue"
                  : location.pathname.startsWith("/clients")
                    ? "Clients"
                    : location.pathname.startsWith("/requests")
                      ? "Requests"
                      : location.pathname.startsWith("/reminders")
                        ? "Reminders"
                        : location.pathname.startsWith("/settings")
                          ? "Settings"
                          : "Overview"}
              </strong>
            </span>
          </div>
          <div className="topbar-right">
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              title="Refresh workspace to see the latest client updates"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  await queryClient.invalidateQueries();
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              <RefreshCw size={18} className={refreshing ? "spin" : ""} />
            </button>
            <span className="workspace-health">
              <span />
              Your documents, in order
            </span>
            <Avatar name={user.name} size="small" />
          </div>
        </header>
        <main className="main-content">
          <Outlet context={{ user, firm, overview }} />
        </main>
        <footer className="workspace-footer">
          <span>DocChase · A little less back and forth.</span>
          <span>
            Private by design <span className="footer-dot">·</span> Built for
            your practice
          </span>
        </footer>
      </div>
    </div>
  );
}
class Boundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal-state">
        <h1>The workspace couldn’t open.</h1>
        <p>Please reload the page to try again.</p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  return (
    <Boundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<AuthPage />} />
              <Route path="/register" element={<AuthPage register />} />
              <Route path="/upload/:token" element={<Portal />} />
              <Route element={<Layout />}>
                <Route path="/workspace" element={<Dashboard />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/requests" element={<Requests />} />
                <Route path="/requests/:id" element={<RequestDetail />} />
                <Route path="/review" element={<ReviewQueue />} />
                <Route path="/review/:id" element={<ReviewPage />} />
                <Route path="/reminders" element={<Reminders />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/workspace" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </Boundary>
  );
}
