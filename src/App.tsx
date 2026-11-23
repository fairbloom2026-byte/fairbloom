import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Ban,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Flower2,
  LayoutDashboard,
  Leaf,
  LogOut,
  Mail,
  MapPin,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  ClipboardCheck,
  Store,
  ShieldX,
  TrendingUp,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  adminApi,
  ApiError,
  authToken,
  formatCurrency,
  formatDate,
  formatNumber,
  dealParties,
  submitterName,
  type AdminNotification,
  type AdminUser,
  type ListingReviewStatus,
  type ReviewListing,
  type Transaction,
  type TransactionStatus,
  type VerificationStatus,
  type VerificationUser,
} from "./api";

type Page = "overview" | "listings" | "review" | "history" | "verifications" | "members";
type Notice = { message: string; tone: "success" | "error" };

const pageMeta: Record<Page, { label: string; description: string }> = {
  overview: { label: "Overview", description: "A clear view of what needs your attention." },
  // "listings" and "review" are the two tabs of one Review queue page.
  listings: {
    label: "Review queue",
    description:
      "Posts priced far above or below the market price stay hidden until you review them.",
  },
  review: {
    label: "Review queue",
    description: "Sales priced far from the market index don't count until you approve them.",
  },
  history: {
    label: "Sale records",
    description: "Search every sale recorded from accepted deals.",
  },
  verifications: {
    label: "Member verification",
    description: "Review farmer IDs and buyer business permits.",
  },
  members: { label: "Members", description: "Find accounts and manage member access." },
};

const navItems: { page: Page; icon: typeof LayoutDashboard }[] = [
  { page: "overview", icon: LayoutDashboard },
  { page: "listings", icon: ClipboardCheck },
  { page: "history", icon: TrendingUp },
  { page: "verifications", icon: BadgeCheck },
  { page: "members", icon: Users },
];

export default function App() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [page, setPage] = useState<Page>("overview");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const noticeTimer = useRef<number | undefined>(undefined);
  const notify = useCallback((message: string, tone: Notice["tone"] = "success") => {
    // Restart the timer so an older notice's timeout can't hide a newer one early.
    window.clearTimeout(noticeTimer.current);
    setNotice({ message, tone });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4200);
  }, []);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const signOut = useCallback(() => {
    authToken.clear();
    setUser(null);
    setPage("overview");
  }, []);

  useEffect(() => {
    let active = true;
    const token = authToken.get();
    if (!token) {
      setCheckingSession(false);
      return;
    }

    adminApi
      .me()
      .then(({ user: current }) => {
        if (!active) return;
        if (current.role !== "admin") {
          authToken.clear();
          notify("This workspace is only available to administrator accounts.", "error");
          return;
        }
        setUser(current);
      })
      .catch(() => {
        if (active) authToken.clear();
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, [notify]);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setPage("overview");
      notify("Your session expired. Please sign in again.", "error");
    };
    window.addEventListener("fairbloom:unauthorized", onUnauthorized);
    return () => window.removeEventListener("fairbloom:unauthorized", onUnauthorized);
  }, [notify]);

  const login = async (email: string, password: string) => {
    const result = await adminApi.login(email, password);
    if (result.user.role !== "admin") {
      throw new ApiError("This workspace is only available to administrator accounts.", 403);
    }
    authToken.set(result.token);
    try {
      const { user: current } = await adminApi.me();
      if (current.role !== "admin")
        throw new ApiError("This workspace is only available to administrator accounts.", 403);
      setUser(current);
    } catch (error) {
      authToken.clear();
      throw error;
    }
  };

  if (checkingSession) return <FullScreenLoading />;
  if (!user) return <LoginScreen onLogin={login} />;

  return (
    <div className="app-shell">
      <Sidebar
        active={page}
        open={mobileNavOpen}
        user={user}
        onNavigate={(next) => {
          setPage(next);
          setMobileNavOpen(false);
        }}
        onSignOut={signOut}
      />
      {mobileNavOpen ? (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <main className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="topbar-title">
            <span className="eyebrow">FAIRBLOOM ADMIN</span>
            <h1>{pageMeta[page].label}</h1>
          </div>
          <div className="topbar-user">
            <NotificationBell
              onNavigate={(next) => {
                setPage(next);
                setMobileNavOpen(false);
              }}
            />
            <div className="user-avatar">
              <UserRound size={18} />
            </div>
            <div className="topbar-user-info">
              <strong>{user.name}</strong>
              <span>Administrator</span>
            </div>
            <button className="signout-button" onClick={signOut}>
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
          </div>
        </header>
        <div className="page-content">
          <div className="page-intro">
            <div>
              <p>{pageMeta[page].description}</p>
            </div>
            <span className="today-label">
              {new Intl.DateTimeFormat("en-PH", { dateStyle: "long" }).format(new Date())}
            </span>
          </div>
          {page === "overview" ? <Overview onNavigate={setPage} notify={notify} /> : null}
          {page === "listings" || page === "review" ? (
            <ReviewQueue tab={page} onTab={setPage} notify={notify} />
          ) : null}
          {page === "history" ? <HistoryPage /> : null}
          {page === "verifications" ? <VerificationsPage notify={notify} /> : null}
          {page === "members" ? <MembersPage notify={notify} /> : null}
        </div>
      </main>
      {notice ? (
        <div className={`toast toast-${notice.tone}`} role="status">
          {notice.tone === "success" ? <Check size={17} /> : <ShieldX size={17} />}
          {notice.message}
        </div>
      ) : null}
    </div>
  );
}

function FullScreenLoading() {
  return (
    <div className="full-loading">
      <span className="spinner" />
      <span>Checking your administrator session…</span>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onLogin(email.trim(), password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-art" aria-hidden="true">
        <div className="login-brand">
          <span className="brand-mark">
            <Flower2 size={26} />
          </span>
          <span>FairBloom</span>
        </div>
        <div className="login-art-copy">
          <span className="eyebrow">ROOTED IN TRUST</span>
          <h1>A fairer flower trade starts with care.</h1>
          <p>One calm place to support the people and decisions behind Benguet’s flower market.</p>
        </div>
        <div className="login-flower">
          <Flower2 size={280} strokeWidth={0.65} />
        </div>
        <span className="login-art-foot">Benguet, Philippines · FairBloom 2026</span>
      </div>
      <div className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="login-mobile-brand">
            <span className="brand-mark">
              <Flower2 size={23} />
            </span>
            <span>FairBloom</span>
          </div>
          <span className="eyebrow">ADMINISTRATOR ACCESS</span>
          <h2>Welcome back</h2>
          <p className="muted">Sign in with your administrator account to continue.</p>
          <label className="field">
            <span>Email address</span>
            <span className="input-wrap">
              <Mail size={17} />
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@fairbloom.ph"
                required
              />
            </span>
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
            />
          </label>
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
          <button className="button button-primary login-submit" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner spinner-light" /> Signing in…
              </>
            ) : (
              <>
                Sign in <ArrowRight size={17} />
              </>
            )}
          </button>
          <div className="login-foot">
            <ShieldCheck size={15} />
            <span>Administrator accounts only</span>
          </div>
        </form>
      </div>
    </div>
  );
}

function Sidebar({
  active,
  open,
  user,
  onNavigate,
  onSignOut,
}: {
  active: Page;
  open: boolean;
  user: AdminUser;
  onNavigate: (page: Page) => void;
  onSignOut: () => void;
}) {
  // Both review tabs highlight the single "Review queue" entry.
  const current = active === "review" ? "listings" : active;
  return (
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <a
        className="brand"
        href="#"
        onClick={(event) => {
          event.preventDefault();
          onNavigate("overview");
        }}
      >
        <span className="brand-mark">
          <Flower2 size={24} />
        </span>
        <span className="brand-name">
          FairBloom<small>ADMIN WORKSPACE</small>
        </span>
      </a>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Admin navigation">
        {navItems.map(({ page, icon: Icon }) => (
          <button
            key={page}
            className={`nav-link ${current === page ? "nav-link-active" : ""}`}
            aria-label={pageMeta[page].label}
            aria-current={current === page ? "page" : undefined}
            onClick={() => onNavigate(page)}
          >
            <Icon size={19} strokeWidth={1.8} />
            <span>{pageMeta[page].label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <ShieldCheck size={17} />
          <span>Protected admin access</span>
        </div>
        <div className="sidebar-profile">
          <span className="profile-monogram">{user.name.slice(0, 1).toUpperCase()}</span>
          <span className="profile-copy">
            <strong>{user.name}</strong>
            <small>Administrator</small>
          </span>
          <button className="sidebar-logout" aria-label="Sign out" onClick={onSignOut}>
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Where an admin notification leads. The backend sends admins these two types (see utils/notify.js callers). */
function notificationPage(item: AdminNotification): Page | null {
  if (item.type === "verification_pending") return "verifications";
  if (item.type === "listing_pending") return "listings";
  if (item.type === "transaction_flagged") return "review";
  return null;
}

const UNREAD_POLL_MS = 60_000;

function NotificationBell({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the badge current while the workspace is open.
  useEffect(() => {
    let active = true;
    const refresh = () => {
      adminApi
        .unreadNotifications()
        .then(({ unreadCount }) => {
          if (active) setUnread(unreadCount);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, UNREAD_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    adminApi
      .notifications()
      .then((result) => {
        if (!active) return;
        setItems(result.notifications);
        setUnread(result.unreadCount);
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Could not load notifications.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const onPointer = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      active = false;
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = async (item: AdminNotification) => {
    if (!item.isRead) {
      try {
        await adminApi.markNotificationRead(item._id);
        setItems((current) =>
          current.map((entry) => (entry._id === item._id ? { ...entry, isRead: true } : entry))
        );
        setUnread((count) => Math.max(0, count - 1));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not update this notification.");
        return;
      }
    }
    const target = notificationPage(item);
    if (target) {
      setOpen(false);
      onNavigate(target);
    }
  };

  const markAll = async () => {
    setBusy(true);
    setError("");
    try {
      await adminApi.markAllNotificationsRead();
      setItems((current) => current.map((entry) => ({ ...entry, isRead: true })));
      setUnread(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update notifications.");
    } finally {
      setBusy(false);
    }
  };

  const label = unread ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        className="icon-button notif-button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={17} />
        {unread ? (
          <span className="notif-count" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <section className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-heading">
            <div>
              <span className="eyebrow">ACTIVITY</span>
              <h3>Notifications</h3>
            </div>
            <button
              className="text-button"
              disabled={!unread || busy}
              onClick={() => void markAll()}
            >
              <CheckCheck size={15} /> Mark all read
            </button>
          </div>
          {error ? (
            <div className="form-error notif-error" role="alert">
              {error}
            </div>
          ) : null}
          {loading && !items.length ? (
            <div className="notif-loading">
              <LoadingRows count={3} />
            </div>
          ) : items.length ? (
            <div className="notif-list">
              {items.map((item) => (
                <button
                  key={item._id}
                  className={`notif-item ${item.isRead ? "" : "notif-unread"}`}
                  onClick={() => void openItem(item)}
                >
                  <span className="notif-dot" aria-hidden="true" />
                  <span className="notif-copy">
                    <strong>
                      {item.title}
                      {item.count && item.count > 1 ? ` (${item.count})` : ""}
                    </strong>
                    {item.body ? <span>{item.body}</span> : null}
                    <small>
                      {formatDate(item.updatedAt)}
                      {item.isRead ? "" : " · Unread"}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          ) : !error ? (
            <EmptyState
              icon={Bell}
              title="No notifications"
              body="Flagged listings, verifications and flagged sales will appear here."
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Overview({
  onNavigate,
  notify,
}: {
  onNavigate: (page: Page) => void;
  notify: (message: string, tone?: Notice["tone"]) => void;
}) {
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.dashboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    adminApi
      .dashboard()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load overview.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const downloadBackup = async () => {
    setBackupBusy(true);
    try {
      const result = await adminApi.backup();
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      notify("Backup downloaded. It may contain sensitive personal data; store it securely.");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Backup download failed.", "error");
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <section className="stack-lg">
      {error ? (
        <ErrorPanel message={error} onRetry={() => setReload((value) => value + 1)} />
      ) : null}
      <div className="welcome-banner">
        <div className="welcome-copy">
          <span className="eyebrow eyebrow-light">THE ADMIN DESK</span>
          <h2>
            Good work grows
            <br />
            <em>from good care.</em>
          </h2>
          <p>Keep member accounts and sale records moving with thoughtful, timely reviews.</p>
        </div>
        <div className="welcome-flower">
          <Flower2 size={190} strokeWidth={0.65} />
        </div>
        <div className="welcome-chip">
          <span className={`status-pulse ${error ? "status-pulse-error" : ""}`} />
          {error ? "Connection issue" : loading ? "Refreshing records" : "Records synced"}
        </div>
      </div>

      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h2>Today at a glance</h2>
        </div>
        <button
          className="text-button"
          onClick={() => setReload((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? "spin-icon" : ""} /> Refresh
        </button>
      </div>
      <div className="metric-grid">
        <MetricCard
          label="Flagged listings"
          value={loading ? "—" : (data?.pendingListings ?? 0)}
          icon={Store}
          accent="green"
          onClick={() => onNavigate("listings")}
        />
        <MetricCard
          label="Sales to review"
          value={loading ? "—" : (data?.pendingTransactions.length ?? 0)}
          icon={CircleDollarSign}
          accent="gold"
          onClick={() => onNavigate("review")}
        />
        <MetricCard
          label="Verifications waiting"
          value={loading ? "—" : (data?.pendingVerifications ?? 0)}
          icon={BadgeCheck}
          accent="green"
          onClick={() => onNavigate("verifications")}
        />
        <MetricCard
          label="Registered members"
          value={loading ? "—" : (data?.totalUsers ?? 0)}
          icon={Users}
          accent="rose"
          onClick={() => onNavigate("members")}
        />
      </div>

      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NEEDS YOUR EYES</span>
              <h3>Pending sales</h3>
            </div>
            <button className="text-button" onClick={() => onNavigate("review")}>
              View queue <ArrowRight size={15} />
            </button>
          </div>
          {loading ? (
            <LoadingRows count={3} />
          ) : data?.pendingTransactions.length ? (
            <div className="mini-list">
              {data.pendingTransactions.slice(0, 4).map((transaction) => (
                <MiniTransaction key={transaction._id} transaction={transaction} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Check}
              title="All caught up"
              body="There are no sales waiting for review."
            />
          )}
        </section>
        <section className="panel backup-panel">
          <div className="backup-icon">
            <ArrowDownToLine size={21} />
          </div>
          <span className="eyebrow">DATA CARE</span>
          <h3>Secure backup</h3>
          <p>
            Download a complete database backup. This file may include sensitive personal
            information.
          </p>
          <button
            className="button button-secondary"
            onClick={() => void downloadBackup()}
            disabled={backupBusy}
          >
            {backupBusy ? (
              <>
                <span className="spinner" /> Preparing…
              </>
            ) : (
              <>
                <ArrowDownToLine size={16} /> Download backup
              </>
            )}
          </button>
          <span className="backup-caption">
            <ShieldCheck size={14} /> Administrator-only · No-store response
          </span>
        </section>
      </div>
      <div className="footnote">
        <Leaf size={15} />
        <span>Every careful review helps keep the Benguet flower market fair for everyone.</span>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  accent,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: typeof Users;
  accent: "gold" | "green" | "rose";
  onClick: () => void;
}) {
  return (
    <button className="metric-card" onClick={onClick}>
      <span className={`metric-icon metric-${accent}`}>
        <Icon size={21} />
      </span>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-link">
        Open list <ArrowRight size={14} />
      </span>
    </button>
  );
}

/** One page for everything waiting on an admin: new listings and flagged sales, as two tabs. */
function ReviewQueue({
  tab,
  onTab,
  notify,
}: {
  tab: "listings" | "review";
  onTab: (page: Page) => void;
  notify: (message: string, tone?: Notice["tone"]) => void;
}) {
  const [counts, setCounts] = useState<{ listings: number; sales: number } | null>(null);
  const [version, setVersion] = useState(0);
  const refreshCounts = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    Promise.all([adminApi.listingReviews("pending", 1), adminApi.pendingTransactions()])
      .then(([listings, sales]) => {
        if (active)
          setCounts({ listings: listings.pagination.total, sales: sales.transactions.length });
      })
      .catch(() => {
        // Each tab shows its own load error; the counts just stay hidden.
      });
    return () => {
      active = false;
    };
  }, [version]);

  const tabs = [
    { page: "listings" as const, label: "Flagged listings", icon: Store, count: counts?.listings },
    {
      page: "review" as const,
      label: "Flagged sales",
      icon: CircleDollarSign,
      count: counts?.sales,
    },
  ];

  return (
    <div className="stack-md">
      <div className="review-switch" role="tablist" aria-label="What to review">
        {tabs.map(({ page, label, icon: Icon, count }) => (
          <button
            key={page}
            role="tab"
            aria-selected={tab === page}
            className={tab === page ? "review-switch-tab active" : "review-switch-tab"}
            onClick={() => onTab(page)}
          >
            <Icon size={17} />
            <span>{label}</span>
            {count !== undefined ? (
              <span className={count ? "review-switch-count waiting" : "review-switch-count"}>
                {count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {tab === "listings" ? (
        <ListingsReviewPage notify={notify} onChange={refreshCounts} />
      ) : (
        <ReviewPage notify={notify} onChange={refreshCounts} />
      )}
    </div>
  );
}

function ReviewPage({
  notify,
  onChange,
}: {
  notify: (message: string, tone?: Notice["tone"]) => void;
  onChange?: () => void;
}) {
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    adminApi
      .pendingTransactions()
      .then(({ transactions }) => {
        if (active) setItems(transactions);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load sales.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const decide = async (item: Transaction, decision: "approve" | "reject") => {
    const action = decision === "approve" ? "Approve" : "Reject";
    if (
      !window.confirm(
        `${action} the ${item.flowerVariety} sale between ${dealParties(item) ?? submitterName(item)}?`
      )
    )
      return;
    setBusyId(item._id);
    try {
      await adminApi.reviewTransaction(item._id, decision);
      setItems((current) => current.filter((entry) => entry._id !== item._id));
      notify(`Sale ${decision === "approve" ? "approved" : "rejected"}.`);
      onChange?.();
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : `Could not ${action.toLowerCase()} this sale.`,
        "error"
      );
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="stack-md">
      <div className="queue-summary">
        <span className="queue-icon">
          <Clock3 size={19} />
        </span>
        <span>
          <strong>
            {loading ? "Loading" : items.length} {items.length === 1 ? "sale" : "sales"} waiting
          </strong>
          <small>Approved sales contribute to the FairBloom price index.</small>
        </span>
        <button
          className="icon-button"
          aria-label="Refresh sales"
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {error ? (
        <ErrorPanel message={error} onRetry={() => setReload((value) => value + 1)} />
      ) : null}
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">FLAGGED BY PRICE CHECK</span>
            <h3>Sales awaiting review</h3>
          </div>
          <span className="count-pill">{items.length}</span>
        </div>
        {loading ? (
          <LoadingRows count={4} />
        ) : items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Sale</th>
                  <th>Traders</th>
                  <th>Agreed price</th>
                  <th>Submitted</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <strong className="table-primary">{item.flowerVariety}</strong>
                      {item.location ? <small className="table-sub">{item.location}</small> : null}
                    </td>
                    <td>
                      <strong>{dealParties(item) ?? submitterName(item)}</strong>
                      <small className="table-sub">
                        {dealParties(item) ? "Farmer → Buyer" : "Member"}
                      </small>
                    </td>
                    <td>
                      <strong>{formatCurrency(item.price)}</strong>
                      <small className="table-sub">
                        {formatNumber(item.volume)} dozen
                        {item.deviationPercent !== null
                          ? ` · ${formatNumber(item.deviationPercent)}% from index`
                          : ""}
                      </small>
                    </td>
                    <td className="table-muted">{formatDate(item.createdAt)}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="button button-danger-soft button-sm"
                          disabled={busyId === item._id}
                          onClick={() => void decide(item, "reject")}
                        >
                          <X size={15} /> Reject
                        </button>
                        <button
                          className="button button-primary button-sm"
                          disabled={busyId === item._id}
                          onClick={() => void decide(item, "approve")}
                        >
                          <Check size={15} /> Approve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !error ? (
          <EmptyState
            icon={Check}
            title="Nothing waiting"
            body="Every sale submission has been reviewed."
          />
        ) : null}
      </section>
    </div>
  );
}

function HistoryPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [items, setItems] = useState<Transaction[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    adminApi
      .transactions(page, debounced)
      .then((result) => {
        if (!active) return;
        setItems(result.transactions);
        setPages(result.pagination.pages);
        setTotal(result.pagination.total);
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Unable to load sale records.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, debounced, reload]);

  return (
    <section className="panel table-panel">
      <div className="panel-heading history-heading">
        <div>
          <span className="eyebrow">RECORDS</span>
          <h3>All sale transactions</h3>
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search flower variety"
            aria-label="Search flower variety"
          />
          {search ? (
            <button aria-label="Clear search" onClick={() => setSearch("")}>
              <X size={15} />
            </button>
          ) : null}
        </label>
      </div>
      {error ? (
        <ErrorPanel message={error} onRetry={() => setReload((value) => value + 1)} />
      ) : null}
      {loading ? (
        <LoadingRows count={5} />
      ) : items.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Flower variety</th>
                <th>Traders</th>
                <th>Sale details</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id}>
                  <td>
                    <strong className="table-primary">{item.flowerVariety}</strong>
                    {item.location ? <small className="table-sub">{item.location}</small> : null}
                  </td>
                  <td>
                    {dealParties(item) ?? submitterName(item)}
                    <small className="table-sub">
                      {item.source === "manual" ? "Manual report" : "Accepted deal"}
                    </small>
                  </td>
                  <td>
                    <strong>{formatCurrency(item.price)}</strong>
                    <small className="table-sub">{formatNumber(item.volume)} dozen</small>
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="table-muted">{formatDate(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error ? (
        <EmptyState
          icon={TrendingUp}
          title="No sale records found"
          body={search ? "Try another flower variety." : "Sale transactions will appear here."}
        />
      ) : null}
      <Pagination page={page} pages={pages} total={total} pageSize={30} onChange={setPage} />
    </section>
  );
}

function ListingsReviewPage({
  notify,
  onChange,
}: {
  notify: (message: string, tone?: Notice["tone"]) => void;
  onChange?: () => void;
}) {
  const [status, setStatus] = useState<ListingReviewStatus>("pending");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ReviewListing[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState("");
  const [rejecting, setRejecting] = useState<ReviewListing | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    adminApi
      .listingReviews(status, page)
      .then((result) => {
        if (!active) return;
        setItems(result.listings);
        setPages(result.pagination.pages);
        setTotal(result.pagination.total);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load listings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [status, page, reload]);

  const chooseStatus = (next: ListingReviewStatus) => {
    setStatus(next);
    setPage(1);
  };

  const decide = async (
    item: ReviewListing,
    decision: "approve" | "reject",
    rejectionReason?: string
  ) => {
    setBusyId(item._id);
    try {
      await adminApi.reviewListing(item._id, decision, rejectionReason);
      notify(
        decision === "approve"
          ? `${item.flowerVariety} listing approved. It is now live.`
          : `${item.flowerVariety} listing rejected.`
      );
      setRejecting(null);
      setReason("");
      setReload((value) => value + 1);
      onChange?.();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not review this listing.", "error");
    } finally {
      setBusyId("");
    }
  };

  const submitRejection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rejecting || !reason.trim() || reason.trim().length > 300) return;
    void decide(rejecting, "reject", reason.trim());
  };

  return (
    <div className="stack-md">
      <div className="filter-tabs" role="tablist" aria-label="Listing review status">
        {(["pending", "approved", "rejected"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={status === value}
            className={status === value ? "filter-tab active" : "filter-tab"}
            onClick={() => chooseStatus(value)}
          >
            {value === "pending" ? "Waiting review" : capitalize(value)}
          </button>
        ))}
        <button
          className="icon-button filter-refresh"
          aria-label="Refresh listing queue"
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {error ? (
        <ErrorPanel message={error} onRetry={() => setReload((value) => value + 1)} />
      ) : null}
      {loading ? (
        <div className="verification-grid">
          <LoadingCard />
          <LoadingCard />
        </div>
      ) : items.length ? (
        <div className="verification-grid">
          {items.map((item) => (
            <ListingReviewCard
              key={item._id}
              item={item}
              status={status}
              busy={busyId === item._id}
              onApprove={() => void decide(item, "approve")}
              onReject={() => {
                setRejecting(item);
                setReason("");
              }}
            />
          ))}
        </div>
      ) : !error ? (
        <EmptyState
          icon={Store}
          title={status === "pending" ? "No flagged listings" : `No ${status} listings`}
          body={
            status === "pending"
              ? "Listings priced far above or below the market price will appear here."
              : `No flagged listings have been ${status} yet.`
          }
        />
      ) : null}
      <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      {rejecting ? (
        <Modal
          title={`Reject ${rejecting.flowerVariety} listing`}
          onClose={() => setRejecting(null)}
        >
          <form className="stack-md" onSubmit={submitRejection}>
            <p className="muted">
              The listing stays hidden from the marketplace. The member sees this reason in the app;
              once they fix the price it goes live again.
            </p>
            <label className="field">
              <span>
                Reason <small>Required · up to 300 characters</small>
              </span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={300}
                rows={4}
                placeholder="e.g. The photo doesn't show the flowers being sold…"
                required
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setRejecting(null)}
              >
                Cancel
              </button>
              <button
                className="button button-danger"
                disabled={!reason.trim() || busyId === rejecting._id}
              >
                {busyId === rejecting._id ? "Submitting…" : "Reject listing"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function ListingReviewCard({
  item,
  status,
  busy,
  onApprove,
  onReject,
}: {
  item: ReviewListing;
  status: ListingReviewStatus;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const imageSrc = item.imageUrl ? adminApi.listingImageSrc(item.imageUrl) : "";
  const poster = item.postedBy;
  const kind = item.type === "sell" ? "For sale" : "In demand";

  return (
    <article className="verification-card">
      <div className="document-frame">
        {imageSrc ? (
          <button
            type="button"
            className="document-preview-trigger"
            aria-label={`Preview the ${item.flowerVariety} photo`}
            onClick={() => setPreviewOpen(true)}
          >
            <img src={imageSrc} alt={`${item.flowerVariety} listing photo`} />
          </button>
        ) : (
          <div className="document-placeholder">
            <Flower2 size={25} />
            <span>No photo attached</span>
          </div>
        )}
      </div>
      <div className="verification-body">
        <div className="verification-title">
          <div>
            <h3>{item.flowerVariety}</h3>
            <span>
              {kind} · {formatNumber(item.quantity)} dozen
              {item.pricePerUnit != null
                ? ` · ${formatCurrency(item.pricePerUnit)} per dozen`
                : " · Open price"}
            </span>
          </div>
          <StatusBadge status={item.reviewStatus ?? "approved"} />
        </div>
        <div className="verification-meta">
          <span>
            <UserRound size={14} />
            {poster
              ? `${poster.name} (${poster.role === "farmer" ? "Farmer" : "Buyer"})`
              : "Deleted member"}
          </span>
          {poster?.email ? (
            <span>
              <Mail size={14} />
              {poster.email}
            </span>
          ) : null}
        </div>
        <div className="location-line">
          <MapPin size={14} />
          {item.location}
          {item.status !== "active" ? <span>{capitalize(item.status)}</span> : null}
        </div>
        {item.priceDeviationPercent != null && item.marketVwapAtCheck != null ? (
          <p
            className={`price-flag ${item.priceDeviationPercent > 0 ? "price-flag-above" : "price-flag-below"}`}
          >
            <strong>
              {formatNumber(Math.abs(item.priceDeviationPercent))}%{" "}
              {item.priceDeviationPercent > 0 ? "above" : "below"} market
            </strong>
            <span>Market price {formatCurrency(item.marketVwapAtCheck)} per dozen</span>
          </p>
        ) : null}
        {item.description ? <p className="listing-description">{item.description}</p> : null}
        {item.reviewNote ? <p className="review-note">{item.reviewNote}</p> : null}
        <p className="submitted-date">
          Posted {formatDate(item.createdAt)}
          {item.reviewedAt && status !== "pending"
            ? ` · Reviewed ${formatDate(item.reviewedAt)}${item.reviewedBy ? ` by ${item.reviewedBy.name}` : ""}`
            : ""}
        </p>
        {status === "pending" ? (
          <div className="verification-actions">
            <button className="button button-danger-soft" disabled={busy} onClick={onReject}>
              <X size={16} /> Reject
            </button>
            <button className="button button-primary" disabled={busy} onClick={onApprove}>
              <Check size={16} /> Approve listing
            </button>
          </div>
        ) : status === "rejected" ? (
          <div className="verification-actions">
            <button className="button button-primary" disabled={busy} onClick={onApprove}>
              <Check size={16} /> Approve anyway
            </button>
          </div>
        ) : null}
      </div>
      {previewOpen && imageSrc ? (
        <Modal
          title={`${item.flowerVariety} photo`}
          className="document-preview-modal"
          onClose={() => setPreviewOpen(false)}
        >
          <div className="document-preview-image">
            <img src={imageSrc} alt={`${item.flowerVariety} listing photo`} />
          </div>
        </Modal>
      ) : null}
    </article>
  );
}

function VerificationsPage({
  notify,
}: {
  notify: (message: string, tone?: Notice["tone"]) => void;
}) {
  const [status, setStatus] = useState<VerificationStatus>("pending");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<VerificationUser[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState("");
  const [rejecting, setRejecting] = useState<VerificationUser | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    adminApi
      .verifications(status, page)
      .then((result) => {
        if (!active) return;
        setItems(result.users);
        setPages(result.pagination.pages);
        setTotal(result.pagination.total);
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Unable to load verifications.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [status, page, reload]);

  const chooseStatus = (next: VerificationStatus) => {
    setStatus(next);
    setPage(1);
  };

  const decide = async (
    item: VerificationUser,
    decision: "approve" | "reject",
    rejectionReason?: string
  ) => {
    setBusyId(item._id);
    try {
      await adminApi.reviewVerification(item._id, decision, rejectionReason);
      notify(`Verification ${decision === "approve" ? "approved" : "rejected"}.`);
      setRejecting(null);
      setReason("");
      setReload((value) => value + 1);
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Could not review this verification.",
        "error"
      );
    } finally {
      setBusyId("");
    }
  };

  const submitRejection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rejecting || !reason.trim() || reason.trim().length > 300) return;
    void decide(rejecting, "reject", reason.trim());
  };

  return (
    <div className="stack-md">
      <div className="filter-tabs" role="tablist" aria-label="Verification status">
        {(["pending", "approved", "rejected"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={status === value}
            className={status === value ? "filter-tab active" : "filter-tab"}
            onClick={() => chooseStatus(value)}
          >
            {value === "pending"
              ? "Waiting review"
              : value === "approved"
                ? "Approved"
                : "Rejected"}
          </button>
        ))}
        <button
          className="icon-button filter-refresh"
          aria-label="Refresh verification queue"
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {error ? (
        <ErrorPanel message={error} onRetry={() => setReload((value) => value + 1)} />
      ) : null}
      {loading ? (
        <div className="verification-grid">
          <LoadingCard />
          <LoadingCard />
        </div>
      ) : items.length ? (
        <div className="verification-grid">
          {items.map((item) => (
            <VerificationCard
              key={item._id}
              item={item}
              status={status}
              busy={busyId === item._id}
              onApprove={() => void decide(item, "approve")}
              onReject={() => {
                setRejecting(item);
                setReason("");
              }}
            />
          ))}
        </div>
      ) : !error ? (
        <EmptyState
          icon={BadgeCheck}
          title={`No ${status} verifications`}
          body={
            status === "pending"
              ? "New member documents will appear here."
              : `There are no ${status} verification records.`
          }
        />
      ) : null}
      <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      {rejecting ? (
        <Modal title={`Reject ${rejecting.name}'s verification`} onClose={() => setRejecting(null)}>
          <form className="stack-md" onSubmit={submitRejection}>
            <p className="muted">
              Give the member a clear reason so they know what to correct. The reason is shown to
              them in the app.
            </p>
            <label className="field">
              <span>
                Reason <small>Required · up to 300 characters</small>
              </span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={300}
                rows={4}
                placeholder="Explain what needs to be corrected…"
                required
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setRejecting(null)}
              >
                Cancel
              </button>
              <button
                className="button button-danger"
                disabled={!reason.trim() || busyId === rejecting._id}
              >
                {busyId === rejecting._id ? "Submitting…" : "Reject verification"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function VerificationCard({
  item,
  status,
  busy,
  onApprove,
  onReject,
}: {
  item: VerificationUser;
  status: VerificationStatus;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [imageError, setImageError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setImageError("");
    if (item.documentUrl) {
      adminApi
        .verificationImage(item.documentUrl)
        .then((url) => {
          objectUrl = url;
          if (active) setImageUrl(url);
          else URL.revokeObjectURL(url);
        })
        .catch((error) => {
          if (active)
            setImageError(error instanceof Error ? error.message : "Document unavailable.");
        });
    } else {
      setImageUrl("");
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.documentUrl]);

  return (
    <article className="verification-card">
      <div className="document-frame">
        {imageUrl ? (
          <button
            type="button"
            className="document-preview-trigger"
            aria-label={`Preview ${item.name}'s verification document`}
            onClick={() => setPreviewOpen(true)}
          >
            <img src={imageUrl} alt={`${item.name}'s verification document`} />
          </button>
        ) : (
          <div className="document-placeholder">
            <ShieldX size={25} />
            <span>{imageError || "No document on file"}</span>
          </div>
        )}
      </div>
      <div className="verification-body">
        <div className="verification-title">
          <div>
            <h3>{item.name}</h3>
            <span>{item.role === "farmer" ? "Farmer" : "Buyer"}</span>
          </div>
          <StatusBadge status={item.verificationStatus} />
        </div>
        <div className="verification-meta">
          <span>
            <Mail size={14} />
            {item.email}
          </span>
          {item.phone ? (
            <span>
              <UserRound size={14} />
              {item.phone}
            </span>
          ) : null}
        </div>
        <div className="location-line">
          {item.farmLocation || item.businessLocation ? (
            <>
              <MapPin size={14} />
              {item.farmLocation || item.businessLocation}
            </>
          ) : null}
          {item.buyerCategory ? <span>{item.buyerCategory}</span> : null}
        </div>
        {item.verificationNote ? <p className="review-note">{item.verificationNote}</p> : null}
        <p className="submitted-date">Joined {formatDate(item.createdAt)}</p>
        {status === "pending" ? (
          <div className="verification-actions">
            <button className="button button-danger-soft" disabled={busy} onClick={onReject}>
              <X size={16} /> Reject
            </button>
            <button
              className="button button-primary"
              disabled={busy || !item.documentUrl}
              onClick={onApprove}
            >
              <Check size={16} /> Approve member
            </button>
          </div>
        ) : null}
      </div>
      {previewOpen && imageUrl ? (
        <Modal
          title={`${item.name}'s verification document`}
          className="document-preview-modal"
          onClose={() => setPreviewOpen(false)}
        >
          <div className="document-preview-image">
            <img src={imageUrl} alt={`${item.name}'s verification document`} />
          </div>
        </Modal>
      ) : null}
    </article>
  );
}

function MembersPage({ notify }: { notify: (message: string, tone?: Notice["tone"]) => void }) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [verified, setVerified] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminUser[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilterSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    adminApi
      .users({ search: filterSearch, role, status, verified, page })
      .then((result) => {
        if (!active) return;
        setItems(result.users);
        setPages(result.pagination.pages);
        setTotal(result.pagination.total);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load members.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filterSearch, role, status, verified, page, reload]);

  if (selectedId) {
    return (
      <MemberDetail
        id={selectedId}
        onBack={() => setSelectedId("")}
        onChanged={() => {
          setSelectedId("");
          setReload((value) => value + 1);
        }}
        notify={notify}
      />
    );
  }

  const changeFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  return (
    <section className="panel table-panel">
      <div className="panel-heading members-heading">
        <div>
          <span className="eyebrow">DIRECTORY</span>
          <h3>
            Member accounts <span className="subtle-count">{total.toLocaleString()}</span>
          </h3>
        </div>
        <button
          className="icon-button"
          aria-label="Refresh members"
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <div className="filter-bar">
        <label className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or email"
            aria-label="Search name or email"
          />
          {search ? (
            <button aria-label="Clear search" onClick={() => setSearch("")}>
              <X size={15} />
            </button>
          ) : null}
        </label>
        <label className="select-box">
          <span className="sr-only">Filter by role</span>
          <select value={role} onChange={(event) => changeFilter(setRole, event.target.value)}>
            <option value="">All roles</option>
            <option value="farmer">Farmer</option>
            <option value="buyer">Buyer</option>
            <option value="admin">Admin</option>
          </select>
          <ChevronDown size={15} />
        </label>
        <label className="select-box">
          <span className="sr-only">Filter by account status</span>
          <select value={status} onChange={(event) => changeFilter(setStatus, event.target.value)}>
            <option value="">All account statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown size={15} />
        </label>
        <label className="select-box">
          <span className="sr-only">Filter by email verification</span>
          <select
            value={verified}
            onChange={(event) => changeFilter(setVerified, event.target.value)}
          >
            <option value="">Any email status</option>
            <option value="true">Email verified</option>
            <option value="false">Email not verified</option>
          </select>
          <ChevronDown size={15} />
        </label>
      </div>
      {error ? (
        <ErrorPanel message={error} onRetry={() => setReload((value) => value + 1)} />
      ) : null}
      {loading ? (
        <LoadingRows count={4} />
      ) : items.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Verification</th>
                <th>Account</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id}>
                  <td>
                    <div className="member-cell">
                      <span className="profile-monogram">
                        {item.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <strong>{item.name}</strong>
                        <small className="table-sub">{item.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="role-pill">{item.role}</span>
                  </td>
                  <td>
                    {item.role === "admin" ? (
                      <span className="table-muted">Not required</span>
                    ) : (
                      <StatusBadge status={item.verificationStatus} />
                    )}
                  </td>
                  <td>
                    <span
                      className={`account-state ${item.isActive ? "is-active" : "is-inactive"}`}
                    >
                      <i />
                      {item.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="table-muted">{formatDate(item.createdAt)}</td>
                  <td>
                    <button
                      className="button button-quiet button-sm"
                      onClick={() => setSelectedId(item._id)}
                    >
                      View account <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error ? (
        <EmptyState
          icon={Users}
          title="No members found"
          body="Try changing your search or filters."
        />
      ) : null}
      <Pagination page={page} pages={pages} total={total} onChange={setPage} />
    </section>
  );
}

function MemberDetail({
  id,
  onBack,
  onChanged,
  notify,
}: {
  id: string;
  onBack: () => void;
  onChanged: () => void;
  notify: (message: string, tone?: Notice["tone"]) => void;
}) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [activity, setActivity] = useState<{
    activeListings: number;
    transactions: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [retention, setRetention] = useState<"anonymize" | "delete">("anonymize");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    adminApi
      .user(id)
      .then((result) => {
        if (active) {
          setUser(result.user);
          setActivity(result.activity);
        }
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Unable to load this account.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, reload]);

  const changeStatus = async () => {
    if (!user) return;
    const action = user.isActive ? "deactivate" : "reactivate";
    const detail = user.isActive
      ? "Active listings will be cancelled and open deals will be cancelled."
      : "This member will be able to sign in again.";
    if (
      !window.confirm(
        `${action === "deactivate" ? "Deactivate" : "Reactivate"} ${user.name}?\n\n${detail}`
      )
    )
      return;
    setBusy(true);
    try {
      const result = await adminApi.setUserStatus(id, !user.isActive);
      setUser(result.user);
      const cleanup = result.cleanup
        ? ` ${result.cleanup.listingsCancelled} active ${result.cleanup.listingsCancelled === 1 ? "listing" : "listings"} and ${result.cleanup.openDealsCancelled} open ${result.cleanup.openDealsCancelled === 1 ? "deal" : "deals"} cancelled.`
        : "";
      notify(`${result.message}.${cleanup}`);
      if (!result.user.isActive) onChanged();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not update this account.", "error");
    } finally {
      setBusy(false);
    }
  };

  const erase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || confirmEmail !== user.email) return;
    const transactionText =
      retention === "anonymize"
        ? "Transaction history will be anonymized and kept in the price index."
        : "The member's transaction history will also be deleted.";
    if (
      !window.confirm(
        `Permanently erase ${user.name}?\n\n${transactionText}\n\nThis cannot be undone.`
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await adminApi.eraseUser(id, confirmEmail, retention);
      notify(result.message);
      onChanged();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not erase this account.";
      setError(message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="panel detail-loading">
        <span className="spinner" /> Loading member account…
      </div>
    );
  if (error && !user)
    return <ErrorPanel message={error} onRetry={() => setReload((value) => value + 1)} />;
  if (!user || !activity) return null;

  const transactionCount = Object.values(activity.transactions).reduce(
    (sum, count) => sum + count,
    0
  );

  return (
    <div className="stack-md">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} /> Back to members
      </button>
      <section className="panel member-detail-panel">
        <div className="detail-profile">
          <span className="detail-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <span className="eyebrow">MEMBER ACCOUNT</span>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
          </div>
          {user.role !== "admin" ? <StatusBadge status={user.verificationStatus} /> : null}
        </div>
        <div className="detail-facts">
          <Fact label="Role" value={capitalize(user.role)} />
          <Fact label="Account status" value={user.isActive ? "Active" : "Inactive"} />
          <Fact label="Email verified" value={user.isEmailVerified ? "Yes" : "No"} />
          <Fact label="Joined FairBloom" value={formatDate(user.createdAt)} />
          {user.phone ? <Fact label="Phone" value={user.phone} /> : null}
          {user.farmLocation || user.businessLocation ? (
            <Fact label="Location" value={user.farmLocation || user.businessLocation || "—"} />
          ) : null}
          {user.buyerCategory ? <Fact label="Buyer category" value={user.buyerCategory} /> : null}
        </div>
        {user.verificationNote ? (
          <div className="review-note detail-note">
            <ShieldX size={16} />
            {user.verificationNote}
          </div>
        ) : null}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ACTIVITY SNAPSHOT</span>
            <h3>Member activity</h3>
          </div>
        </div>
        <div className="activity-grid">
          <Fact label="Active listings" value={activity.activeListings} />
          <Fact label="Transactions" value={transactionCount} />
          {Object.entries(activity.transactions).map(([key, value]) => (
            <Fact key={key} label={`${capitalize(key)} transactions`} value={value} />
          ))}
        </div>
      </section>
      {user.role !== "admin" ? (
        <>
          <section className="panel action-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">ACCOUNT ACCESS</span>
                <h3>{user.isActive ? "Deactivate account" : "Reactivate account"}</h3>
              </div>
              <span className={`account-state ${user.isActive ? "is-active" : "is-inactive"}`}>
                <i />
                {user.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="muted">
              {user.isActive
                ? "Deactivation cancels this member’s active listings and open deals, and blocks future sign-in."
                : "Reactivation restores this member’s ability to sign in."}
            </p>
            <button
              className={`button ${user.isActive ? "button-secondary" : "button-primary"}`}
              disabled={busy}
              onClick={() => void changeStatus()}
            >
              {user.isActive ? (
                <>
                  <Ban size={16} /> Deactivate member
                </>
              ) : (
                <>
                  <Check size={16} /> Reactivate member
                </>
              )}
            </button>
          </section>
          <section className="panel erase-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow eyebrow-danger">IRREVERSIBLE ACTION</span>
                <h3>Permanently erase account</h3>
              </div>
            </div>
            <p className="muted">
              This permanently removes the participant’s personal data. Choose what happens to their
              transactions, then confirm the account email.
            </p>
            <form className="erase-form" onSubmit={(event) => void erase(event)}>
              <label className="field">
                <span>Transaction handling</span>
                <select
                  value={retention}
                  onChange={(event) => setRetention(event.target.value as typeof retention)}
                >
                  <option value="anonymize">Anonymize and keep in price index</option>
                  <option value="delete">Delete transactions</option>
                </select>
              </label>
              <label className="field">
                <span>
                  Type <strong>{user.email}</strong> to confirm
                </span>
                <input
                  type="email"
                  autoComplete="off"
                  value={confirmEmail}
                  onChange={(event) => setConfirmEmail(event.target.value)}
                  placeholder="Member email address"
                />
              </label>
              {error ? (
                <div className="form-error" role="alert">
                  {error}
                </div>
              ) : null}
              <button
                className="button button-danger"
                disabled={busy || confirmEmail !== user.email}
              >
                <ShieldX size={16} />
                {busy ? "Erasing…" : "Erase account permanently"}
              </button>
            </form>
          </section>
        </>
      ) : (
        <div className="info-banner">
          <ShieldCheck size={18} />
          <span>Administrator accounts cannot be deactivated or erased here.</span>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MiniTransaction({ transaction }: { transaction: Transaction }) {
  return (
    <div className="mini-transaction">
      <span className="mini-flower-icon">
        <Flower2 size={17} />
      </span>
      <span className="mini-transaction-copy">
        <strong>{transaction.flowerVariety}</strong>
        <small>
          {dealParties(transaction) ?? submitterName(transaction)} ·{" "}
          {formatDate(transaction.createdAt)}
        </small>
      </span>
      <strong className="mini-price">{formatCurrency(transaction.price)}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: TransactionStatus | VerificationStatus }) {
  const label = status === "pending" ? "Pending" : capitalize(status);
  return (
    <span className={`status-badge status-${status}`}>
      <i />
      {label}
    </span>
  );
}

function Pagination({
  page,
  pages,
  total,
  onChange,
  pageSize = 20,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize?: number;
  onChange: (page: number) => void;
}) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <div className="pagination">
      <span>
        Showing{" "}
        <strong>
          {first}–{last}
        </strong>{" "}
        of <strong>{total.toLocaleString()}</strong>
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ArrowLeft size={16} />
        </button>
        <span>
          Page {page} of {Math.max(pages, 1)}
        </span>
        <button
          className="icon-button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Check;
  title: string;
  body: string;
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon size={23} />
      </span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-panel" role="alert">
      <div>
        <ShieldX size={18} />
        <span>{message}</span>
      </div>
      <button className="button button-quiet button-sm" onClick={onRetry}>
        <RefreshCw size={14} /> Try again
      </button>
    </div>
  );
}

function LoadingRows({ count }: { count: number }) {
  return (
    <div className="loading-rows" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="panel loading-card">
      <div className="skeleton-image" />
      <LoadingRows count={2} />
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`modal-card ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-heading">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
