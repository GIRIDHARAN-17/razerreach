import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  Store,
  BarChart2,
  Users,
  LogOut,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  ChevronRight,
  Settings,
  Shield,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/lib/aibuyer/authService";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminDashboard,
});

interface Merchant {
  id: string;
  user_id?: string;
  business_name: string;
  business_description?: string;
  contact_email?: string;
  contact_phone?: string;
  status: "pending" | "approved" | "suspended";
  created_at?: string;
  updated_at?: string;
}

interface AuditLog {
  id: string;
  timestamp: string;
  actor_id?: string;
  actor_role?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  result: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

function AdminDashboard() {
  const navigate = useNavigate();
  const user = authService.getUser();

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"overview" | "merchants" | "audit">("overview");

  // Status Change Dialog State
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [targetStatus, setTargetStatus] = useState<"pending" | "approved" | "suspended">("approved");
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const handleLogout = async () => {
    await authService.signOut();
    navigate({ to: "/auth", replace: true });
  };

  useEffect(() => {
    if (user?.role !== "admin") {
      toast.error("Admin access required.");
      navigate({ to: "/app", replace: true });
    }
  }, [user, navigate]);

  const fetchMerchants = async () => {
    try {
      const url = statusFilter !== "all" ? `/admin/merchants?status=${statusFilter}` : "/admin/merchants";
      const data = await apiClient<Merchant[]>(url);
      setMerchants(data || []);
    } catch (err) {
      toast.error("Failed to load merchants.");
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await apiClient<{ logs: AuditLog[]; total_count: number }>("/admin/audit-logs?limit=50");
      setAuditLogs(res.logs || []);
      setTotalLogs(res.total_count || 0);
    } catch (err) {
      toast.error("Failed to load audit logs.");
    }
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      await Promise.allSettled([fetchMerchants(), fetchAuditLogs()]);
      setLoading(false);
    }
    loadData();
  }, [statusFilter]);

  const handleOpenStatusModal = (merchant: Merchant, status: "pending" | "approved" | "suspended") => {
    setSelectedMerchant(merchant);
    setTargetStatus(status);
    setStatusModalOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!selectedMerchant) return;
    setUpdatingStatus(true);
    try {
      const updated = await apiClient<Merchant>(`/admin/merchants/${selectedMerchant.id}/status`, {
        method: "PUT",
        data: { status: targetStatus },
      });
      toast.success(`Merchant status updated to ${targetStatus}`);
      setMerchants((prev) => prev.map((m) => (m.id === selectedMerchant.id ? updated : m)));
      setStatusModalOpen(false);
      setSelectedMerchant(null);
      fetchAuditLogs();
    } catch (err) {
      toast.error("Failed to update merchant status.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const approvedCount = merchants.filter((m) => m.status === "approved").length;
  const pendingCount = merchants.filter((m) => m.status === "pending").length;
  const suspendedCount = merchants.filter((m) => m.status === "suspended").length;

  return (
    <div className="flex min-h-screen w-full bg-background flex-col lg:flex-row">
      {/* Admin Dark Sidebar */}
      <aside
        className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-border p-5 text-background lg:flex z-30"
        style={{ background: "linear-gradient(180deg, #090d16 0%, #111827 100%)" }}
      >
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/20 text-primary ring-1 ring-primary/30">
              <Shield className="size-5" />
            </div>
            <div>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-90 text-white">
                Admin Console
              </span>
              <p className="text-[10px] text-white/50">RazorReach Platform</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {(["overview", "merchants", "audit"] as const).map((tab) => {
              const labels: Record<string, string> = {
                overview: "Dashboard",
                merchants: "Merchants",
                audit: "Audit Logs",
              };
              const icons: Record<string, React.ElementType> = {
                overview: BarChart2,
                merchants: Store,
                audit: ShieldCheck,
              };
              const Icon = icons[tab];
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors text-left font-medium",
                    active
                      ? "bg-white/10 text-white font-semibold shadow-inner"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icon className="size-4" />
                  {labels[tab]}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-1">
          <div className="px-3 py-2 text-xs text-white/40 font-mono truncate">
            Admin: {user?.email}
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="size-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Admin Area */}
      <main className="relative flex flex-1 flex-col min-w-0 p-6 lg:p-8 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {activeTab === "overview" && "Platform Operations"}
              {activeTab === "merchants" && "Merchant Directory"}
              {activeTab === "audit" && "Platform Audit Trail"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Administrator Controls · {user?.name || "System Admin"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                fetchMerchants();
                fetchAuditLogs();
              }}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium hover:bg-muted transition-colors"
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </button>
            <Link
              to="/app"
              className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-xs font-semibold hover:bg-muted/80 transition-colors"
            >
              Customer View
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <AdminMetricCard label="Total Merchants" value={merchants.length} icon={Store} color="primary" />
                <AdminMetricCard label="Active Approved" value={approvedCount} icon={CheckCircle2} color="emerald" />
                <AdminMetricCard label="Pending Review" value={pendingCount} icon={Clock} color="amber" />
                <AdminMetricCard label="Suspended" value={suspendedCount} icon={AlertTriangle} color="red" />
              </div>

              {/* Recent Merchants */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Merchant Status Overview</h3>
                  <button onClick={() => setActiveTab("merchants")} className="text-xs text-primary hover:underline font-medium">
                    Manage All
                  </button>
                </div>
                {merchants.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No merchants registered on platform.</p>
                ) : (
                  <div className="space-y-2">
                    {merchants.slice(0, 5).map((m) => (
                      <div key={m.id} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                        <div>
                          <p className="text-sm font-medium">{m.business_name}</p>
                          <p className="text-xs text-muted-foreground">{m.contact_email || "No contact email"}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={m.status} />
                          <button
                            onClick={() => setActiveTab("merchants")}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            <ChevronRight className="size-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Platform Audit Logs */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Recent Audit Events</h3>
                  <button onClick={() => setActiveTab("audit")} className="text-xs text-primary hover:underline font-medium">
                    View Audit Logs ({totalLogs})
                  </button>
                </div>
                {auditLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No audit events recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {auditLogs.slice(0, 5).map((log) => (
                      <div key={log.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 text-xs">
                        <div className="min-w-0 pr-4">
                          <span className="font-mono font-medium text-foreground">{log.action}</span>
                          <span className="text-muted-foreground ml-2">by {log.actor_role || "user"}</span>
                        </div>
                        <time className="text-muted-foreground shrink-0 font-mono">
                          {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "—"}
                        </time>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* MERCHANTS TAB */}
          {activeTab === "merchants" && (
            <motion.div
              key="merchants"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              {/* Filter Row */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                <span className="text-xs text-muted-foreground font-medium mr-2">Filter status:</span>
                {(["all", "approved", "pending", "suspended"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                      statusFilter === st
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-card border border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Merchants Table / Grid */}
              {merchants.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-card">
                  <Store className="mx-auto size-10 text-muted-foreground" />
                  <h3 className="mt-4 text-base font-semibold">No merchants found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {statusFilter !== "all" ? `No merchants with status '${statusFilter}'` : "No merchants exist on platform."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {merchants.map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-base">{m.business_name}</h3>
                          <p className="text-xs text-muted-foreground">{m.contact_email || "ID: " + m.id}</p>
                        </div>
                        <StatusBadge status={m.status} />
                      </div>

                      {m.business_description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{m.business_description}</p>
                      )}

                      <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-muted-foreground">
                          Created: {m.created_at ? new Date(m.created_at).toLocaleDateString() : "N/A"}
                        </span>
                        <div className="flex gap-1.5">
                          {m.status !== "approved" && (
                            <button
                              onClick={() => handleOpenStatusModal(m, "approved")}
                              className="rounded-lg bg-green-500/10 hover:bg-green-500/20 px-2.5 py-1 text-xs font-semibold text-green-600 transition-colors"
                            >
                              Approve
                            </button>
                          )}
                          {m.status !== "suspended" && (
                            <button
                              onClick={() => handleOpenStatusModal(m, "suspended")}
                              className="rounded-lg bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 text-xs font-semibold text-red-600 transition-colors"
                            >
                              Suspend
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* AUDIT TAB */}
          {activeTab === "audit" && (
            <motion.div
              key="audit"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              {auditLogs.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-card">
                  <ShieldCheck className="mx-auto size-10 text-muted-foreground" />
                  <h3 className="mt-4 text-base font-semibold">No audit events available</h3>
                </div>
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-border bg-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{log.action}</span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                              log.result === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
                            )}
                          >
                            {log.result}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Role: <span className="font-medium text-foreground">{log.actor_role || "system"}</span> · Resource: {log.resource_type} ({log.resource_id || "N/A"})
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <time className="text-xs font-mono text-muted-foreground">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                        </time>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Confirmation Modal for Merchant Status Change */}
      <AnimatePresence>
        {statusModalOpen && selectedMerchant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4"
            >
              <h3 className="text-lg font-bold">Change Merchant Status</h3>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to change the status of <span className="font-semibold text-foreground">{selectedMerchant.business_name}</span> from <span className="capitalize font-semibold">{selectedMerchant.status}</span> to <span className="capitalize font-semibold text-primary">{targetStatus}</span>?
              </p>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setStatusModalOpen(false)}
                  disabled={updatingStatus}
                  className="rounded-full border border-border bg-muted/50 px-4 py-2 text-xs font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmStatusChange}
                  disabled={updatingStatus}
                  className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {updatingStatus && <Loader2 className="size-3.5 animate-spin" />}
                  Confirm Status Change
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AdminMetricCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: "primary" | "emerald" | "amber" | "red";
}) {
  const colorMap = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    red: "bg-red-500/10 text-red-600",
  };
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className={cn("flex size-9 items-center justify-center rounded-xl", colorMap[color])}>
        <Icon className="size-4" />
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-green-500/10 text-green-600 border-green-500/20",
    pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    suspended: "bg-red-500/10 text-red-600 border-red-500/20",
  };
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize", map[status] || "bg-muted text-muted-foreground")}>
      {status}
    </span>
  );
}
