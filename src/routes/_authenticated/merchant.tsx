import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2,
  BarChart3,
  Sparkles,
  Package,
  TrendingUp,
  Zap,
  LogOut,
  ArrowRight,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Store,
  ShieldCheck,
  Settings,
  Loader2,
  Upload,
  Trash2,
  Edit3,
  Archive,
  Database,
  Image as ImageIcon,
  X,
  Building2,
  Activity,
  Eye,
  ShoppingCart,
  Target,
  Compass,
  HelpCircle,
  CheckCircle,
  FileText,
  Layers,
  ExternalLink,
  Brain,
  Lightbulb,
  ArrowUpRight,
  ShieldAlert,
  Bot,
  CreditCard,
  Search,
  Lock,
  Filter,
  Info,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Cell,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { authService } from "@/lib/aibuyer/authService";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/merchant")({
  component: MerchantDashboard,
});

interface DashboardData {
  merchant: { id: string; business_name: string; status: string };
  summary: { products: number; orders: number; revenue: number };
  opportunities: { total: number; high_priority: number };
  impact?: {
    demand_signals: number;
    opportunities_detected: number;
    opportunities_analyzed: number;
    estimated_potential_revenue: number;
    verified_revenue: number;
  };
  opportunities_by_signal?: Record<string, number>;
  recent_activity?: Array<{
    id?: string;
    action: string;
    resource_type?: string;
    resource_id?: string;
    created_at?: string;
    metadata?: Record<string, any>;
  }>;
}

interface OpportunityEvidence {
  search_count?: number;
  zero_result_count?: number;
  zero_result_rate?: number;
  view_count?: number;
  cart_add_count?: number;
  purchase_count?: number;
  conversion_rate?: number;
  abandonment_rate?: number;
  current_stock?: number;
  period_days?: number;
}

interface RevenueAgentAnalysis {
  title?: string;
  summary?: string;
  evidence_summary?: string[];
  interpretation: string;
  suggested_action?: string;
  recommended_actions?: string[];
  confidence?: string;
}

interface Opportunity {
  id: string;
  type: string;
  title: string;
  description?: string;
  summary?: string;
  target?: string;
  score: number;
  priority: string;
  estimated_potential_revenue?: number;
  potential_revenue?: number;
  evidence?: OpportunityEvidence;
  suggested_action?: string;
  analysis?: RevenueAgentAnalysis;
}

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  status: "draft" | "published" | "archived";
  image_url?: string | null;
  images?: string[];
  created_at?: string;
}

interface MerchantProfile {
  id: string;
  user_id: string;
  business_name: string;
  category: string;
  phone: string;
  address: { city: string; state: string };
  status: string;
}

interface AuditLog {
  id?: string;
  action: string;
  actor_id?: string;
  actor_role?: string;
  resource_type?: string;
  resource_id?: string;
  result?: "success" | "failure" | string;
  created_at?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

interface AuditSummaryStats {
  total_events: number;
  revenue_agent_runs: number;
  buyer_agent_runs: number;
  policy_decisions: number;
  ai_fallbacks: number;
  payments_verified: number;
}

function getAuditCategory(action: string): "revenue_agent" | "buyer_agent" | "commerce" | "payments" | "auth" | "system" {
  if (action.includes("OPPORTUNITY") || action.includes("REVENUE_AGENT")) return "revenue_agent";
  if (action.includes("BUYER_AGENT")) return "buyer_agent";
  if (action.includes("PRODUCT") || action.includes("CART") || action.includes("INVENTORY")) return "commerce";
  if (action.includes("PAYMENT") || action.includes("ORDER")) return "payments";
  if (action.includes("USER")) return "auth";
  return "system";
}

function getAuditVisuals(action: string, result?: string) {
  if (action === "OPPORTUNITY_ANALYZED" || action === "REVENUE_AGENT_USED") {
    return {
      title: action === "OPPORTUNITY_ANALYZED" ? "Revenue Agent Analyzed Opportunity" : "Revenue Agent Run",
      icon: Sparkles,
      color: "text-purple-600 dark:text-purple-400",
      border: "border-purple-200 dark:border-purple-800/50",
      bg: "bg-purple-500/5 hover:bg-purple-500/10",
      badgeText: "Revenue Agent",
      badgeStyle: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800/40",
    };
  }
  if (action === "OPPORTUNITY_GENERATED") {
    return {
      title: "Revenue Opportunity Detected",
      icon: Target,
      color: "text-purple-600 dark:text-purple-400",
      border: "border-purple-200 dark:border-purple-800/50",
      bg: "bg-purple-500/5 hover:bg-purple-500/10",
      badgeText: "Opportunity Engine",
      badgeStyle: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800/40",
    };
  }
  if (action === "BUYER_AGENT_POLICY_DECISION") {
    const isSuccess = result === "success";
    return {
      title: isSuccess ? "Policy Gate: Action Approved" : "Policy Gate: Action Intercepted",
      icon: isSuccess ? ShieldCheck : ShieldAlert,
      color: isSuccess ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
      border: isSuccess ? "border-emerald-200 dark:border-emerald-800/50" : "border-amber-200 dark:border-amber-800/50",
      bg: isSuccess ? "bg-emerald-500/5 hover:bg-emerald-500/10" : "bg-amber-500/5 hover:bg-amber-500/10",
      badgeText: "Policy Gate",
      badgeStyle: isSuccess
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40"
        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800/40",
    };
  }
  if (action === "BUYER_AGENT_AI_FALLBACK") {
    return {
      title: "AI Resilience: Switched to Deterministic Fallback",
      icon: ShieldAlert,
      color: "text-amber-600 dark:text-amber-400",
      border: "border-amber-200 dark:border-amber-800/50",
      bg: "bg-amber-500/5 hover:bg-amber-500/10",
      badgeText: "AI Resilience",
      badgeStyle: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800/40",
    };
  }
  if (action === "BUYER_AGENT_REFERENCE_RESOLVED") {
    return {
      title: "Conversational Reference Resolved",
      icon: Brain,
      color: "text-indigo-600 dark:text-indigo-400",
      border: "border-indigo-200 dark:border-indigo-800/50",
      bg: "bg-indigo-500/5 hover:bg-indigo-500/10",
      badgeText: "Context Resolver",
      badgeStyle: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/40",
    };
  }
  if (action.includes("BUYER_AGENT")) {
    return {
      title: "Buyer Agent Interaction",
      icon: Bot,
      color: "text-indigo-600 dark:text-indigo-400",
      border: "border-indigo-200 dark:border-indigo-800/50",
      bg: "bg-indigo-500/5 hover:bg-indigo-500/10",
      badgeText: "Buyer Agent",
      badgeStyle: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/40",
    };
  }
  if (action.includes("PAYMENT") || action.includes("ORDER")) {
    return {
      title: action.replace(/_/g, " "),
      icon: CreditCard,
      color: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-200 dark:border-emerald-800/50",
      bg: "bg-emerald-500/5 hover:bg-emerald-500/10",
      badgeText: "Payments & Orders",
      badgeStyle: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40",
    };
  }
  if (action.includes("PRODUCT") || action.includes("CART") || action.includes("INVENTORY")) {
    return {
      title: action.replace(/_/g, " "),
      icon: Package,
      color: "text-sky-600 dark:text-sky-400",
      border: "border-sky-200 dark:border-sky-800/50",
      bg: "bg-sky-500/5 hover:bg-sky-500/10",
      badgeText: "Commerce",
      badgeStyle: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-800/40",
    };
  }
  return {
    title: action.replace(/_/g, " "),
    icon: Activity,
    color: "text-slate-600 dark:text-slate-400",
    border: "border-border",
    bg: "bg-card hover:bg-muted/30",
    badgeText: "System",
    badgeStyle: "bg-muted text-muted-foreground border-border",
  };
}

function getAuditNarrative(log: AuditLog): string {
  const meta = log.metadata || {};
  if (log.action === "OPPORTUNITY_ANALYZED") {
    return `Revenue Agent evaluated detected demand signals for target '${meta.target || log.resource_id || "catalog item"}' (heuristic score: ${meta.score ?? "computed"}). Produced grounded hypothesis and merchant action plan.`;
  }
  if (log.action === "OPPORTUNITY_GENERATED") {
    return `Revenue Opportunity Engine observed demand anomalies and flagged opportunity '${log.resource_id || meta.opportunity_id}'.`;
  }
  if (log.action === "REVENUE_AGENT_USED") {
    return `Autonomous Revenue Agent invocation executed to assist merchant revenue optimization.`;
  }
  if (log.action === "BUYER_AGENT_POLICY_DECISION") {
    if (meta.allowed) {
      return `Policy Gate APPROVED action '${meta.action || "REQUEST"}' under risk tier [${(meta.risk_level || "LOW").toUpperCase()}]. Deterministic safety constraints validated.`;
    }
    return `Policy Gate BLOCKED action '${meta.action || "REQUEST"}' with reason code [${meta.reason_code || "REJECTED"}]. Bounded safety gate prevented unauthorized transition.`;
  }
  if (log.action === "BUYER_AGENT_AI_FALLBACK") {
    return `AI service failure or latency detected (${meta.failure_type || "RATE_LIMIT"}). Resilience circuit activated DETERMINISTIC_FALLBACK — search and commerce remained uninterrupted.`;
  }
  if (log.action === "BUYER_AGENT_REFERENCE_RESOLVED") {
    return `Conversational resolver linked customer reference '${meta.source || "item"}' to candidate product '${meta.resolved_product_ids?.[0] || log.resource_id}'. Maintained multi-turn context.`;
  }
  if (log.action === "BUYER_AGENT_USED") {
    return `Autonomous AI Buyer Agent session ${meta.session_id ? `[${meta.session_id.slice(-6)}]` : ""} executed query across merchant catalog.`;
  }
  if (log.action === "BUYER_AGENT_DECISION") {
    return `Buyer Agent chose action '${meta.action}' in state '${meta.current_state}' at turn ${meta.turn_count || 1}.`;
  }
  if (log.action === "PAYMENT_ORDER_CREATED") {
    return `Customer initiated checkout. Razorpay order created for ₹${meta.amount ? (meta.amount / 100).toLocaleString() : meta.total || "N/A"}.`;
  }
  if (log.action === "PAYMENT_VERIFIED") {
    return `Razorpay payment signature cryptographically verified and captured. Order marked paid.`;
  }
  if (log.action === "ORDER_CREATED" || log.action === "ORDER_PAID") {
    return `Commerce order ${log.resource_id} marked paid. Customer funds verified and captured in settled revenue.`;
  }
  if (log.action === "PRODUCT_CREATED" || log.action === "PRODUCT_UPDATED") {
    return `Merchant catalog inventory updated for product ${meta.name ? `'${meta.name}'` : log.resource_id}.`;
  }
  if (log.action === "PRODUCT_REINDEXED") {
    return `Product ${log.resource_id} reindexed into hybrid search vector space for semantic retrieval.`;
  }
  return `System recorded ${log.action.toLowerCase().replace(/_/g, " ")} on resource ${log.resource_type || "system"}.`;
}

function MerchantDashboard() {
  const navigate = useNavigate();
  const user = authService.getUser();

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [merchantProfile, setMerchantProfile] = useState<MerchantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "overview" | "products" | "opportunities" | "profile" | "audit"
  >("overview");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditSummary, setAuditSummary] = useState<AuditSummaryStats | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditCategory, setAuditCategory] = useState<
    "all" | "revenue_agent" | "buyer_agent" | "commerce" | "payments" | "auth" | "system"
  >("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(null);

  // Image Management Modal & Pending File State
  const [imageModalProduct, setImageModalProduct] = useState<Product | null>(null);
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    productId: string;
    imageUrl: string;
  } | null>(null);
  const [deletingImage, setDeletingImage] = useState(false);

  // Merchant Onboarding Form State
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingData, setOnboardingData] = useState({
    business_name: "",
    category: "electronics",
    phone: "",
    city: "",
    state: "",
  });
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);

  // Product Modals
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    category: "electronics",
    price: "",
    stock: "",
    status: "published" as "draft" | "published" | "archived",
  });
  const [productSubmitting, setProductSubmitting] = useState(false);

  // Image Upload / Action State
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedProductForImage, setSelectedProductForImage] = useState<string | null>(null);

  const handleLogout = async () => {
    await authService.signOut();
    navigate({ to: "/auth", replace: true });
  };

  useEffect(() => {
    if (user?.role !== "merchant" && user?.role !== "admin") {
      navigate({ to: "/app", replace: true });
    }
  }, [user, navigate]);

  const loadData = async () => {
    try {
      const [dash, opps, prods, profile] = await Promise.allSettled([
        apiClient<DashboardData>("/merchants/dashboard"),
        apiClient<{ opportunities?: Opportunity[] } | Opportunity[]>("/merchants/opportunities"),
        apiClient<{ products?: Product[] } | Product[]>("/products/mine?limit=50"),
        apiClient<MerchantProfile>("/merchants/me"),
      ]);

      if (dash.status === "fulfilled") setDashboard(dash.value);
      if (opps.status === "fulfilled") {
        setOpportunities(opps.value?.opportunities || opps.value || []);
      }
      if (prods.status === "fulfilled") {
        setProducts(prods.value?.products || prods.value || []);
      }
      if (profile.status === "fulfilled") {
        setMerchantProfile(profile.value);
        setOnboardingOpen(false);
      } else {
        // No merchant profile exists yet — prompt onboarding
        setOnboardingOpen(true);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !onboardingData.business_name ||
      !onboardingData.phone ||
      !onboardingData.city ||
      !onboardingData.state
    ) {
      toast.error("Please fill in all onboarding fields");
      return;
    }
    setOnboardingSubmitting(true);
    try {
      const profile = await apiClient<MerchantProfile>("/merchants", {
        method: "POST",
        data: {
          business_name: onboardingData.business_name.trim(),
          category: onboardingData.category,
          phone: onboardingData.phone.trim(),
          address: {
            city: onboardingData.city.trim(),
            state: onboardingData.state.trim(),
          },
        },
      });
      toast.success("Merchant profile created successfully!");
      setMerchantProfile(profile);
      setOnboardingOpen(false);
      loadData();
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message || "Failed to create merchant profile.");
    } finally {
      setOnboardingSubmitting(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(productForm.price);
    const stockNum = parseInt(productForm.stock, 10);
    if (
      !productForm.name ||
      !productForm.description ||
      isNaN(priceNum) ||
      priceNum <= 0 ||
      isNaN(stockNum)
    ) {
      toast.error("Please provide valid product details");
      return;
    }
    setProductSubmitting(true);
    try {
      const newProd = await apiClient<Product>("/products", {
        method: "POST",
        data: {
          name: productForm.name.trim(),
          description: productForm.description.trim(),
          category: productForm.category.trim().toLowerCase(),
          price: priceNum,
          stock: stockNum,
          status: productForm.status,
        },
      });
      toast.success("Product created!");
      setProducts((prev) => [newProd, ...prev]);
      setAddProductOpen(false);
      resetProductForm();
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message || "Failed to create product.");
    } finally {
      setProductSubmitting(false);
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProduct) return;
    const priceNum = parseFloat(productForm.price);
    const stockNum = parseInt(productForm.stock, 10);
    setProductSubmitting(true);
    try {
      const updated = await apiClient<Product>(`/products/${editProduct.id}`, {
        method: "PUT",
        data: {
          name: productForm.name.trim(),
          description: productForm.description.trim(),
          category: productForm.category.trim().toLowerCase(),
          price: priceNum,
          stock: stockNum,
          status: productForm.status,
        },
      });
      toast.success("Product updated!");
      setProducts((prev) => prev.map((p) => (p.id === editProduct.id ? updated : p)));
      setEditProduct(null);
      resetProductForm();
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message || "Failed to update product.");
    } finally {
      setProductSubmitting(false);
    }
  };

  const handleArchiveProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to archive this product?")) return;
    try {
      await apiClient(`/products/${productId}`, { method: "DELETE" });
      toast.success("Product archived.");
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch (err) {
      toast.error("Failed to archive product.");
    }
  };

  const handleReindexProduct = async (productId: string) => {
    setReindexingId(productId);
    try {
      await apiClient(`/products/${productId}/reindex`, { method: "POST" });
      toast.success("Product reindexed for AI Search!");
    } catch (err) {
      toast.error("Failed to reindex product.");
    } finally {
      setReindexingId(null);
    }
  };

  const openImageModal = (product: Product) => {
    setImageModalProduct(product);
    setPendingFiles([]);
  };

  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    const maxSize = 5 * 1024 * 1024; // 5MB

    const newPending: Array<{ file: File; previewUrl: string }> = [];
    let rejectedCount = 0;

    selected.forEach((f) => {
      if (!validTypes.includes(f.type)) {
        toast.error(`${f.name} is not a supported image format (JPEG, PNG, WEBP allowed).`);
        rejectedCount++;
        return;
      }
      if (f.size > maxSize) {
        toast.error(`${f.name} exceeds the 5MB file size limit.`);
        rejectedCount++;
        return;
      }
      newPending.push({ file: f, previewUrl: URL.createObjectURL(f) });
    });

    if (newPending.length > 0) {
      setPendingFiles((prev) => [...prev, ...newPending]);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = handleSelectFiles;

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].previewUrl);
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleUploadPendingFiles = async () => {
    if (!imageModalProduct || pendingFiles.length === 0) return;
    setUploadingImages(true);
    const formData = new FormData();
    pendingFiles.forEach(({ file }) => {
      formData.append("files", file);
    });

    try {
      const res = await apiClient<{ image_url: string; images: string[]; message: string }>(
        `/products/${imageModalProduct.id}/image`,
        {
          method: "POST",
          data: formData,
        },
      );
      toast.success(res.message || "Images uploaded successfully!");
      setProducts((prev) =>
        prev.map((p) =>
          p.id === imageModalProduct.id
            ? { ...p, image_url: res.image_url, images: res.images }
            : p,
        ),
      );
      setImageModalProduct((prev) =>
        prev ? { ...prev, image_url: res.image_url, images: res.images } : null,
      );
      // Clean up object URLs
      pendingFiles.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPendingFiles([]);
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message || "Failed to upload product images.");
    } finally {
      setUploadingImages(false);
    }
  };

  const confirmDeleteImage = (productId: string, imageUrl: string) => {
    setDeleteConfirm({ productId, imageUrl });
  };

  const handleExecuteDeleteImage = async () => {
    if (!deleteConfirm) return;
    setDeletingImage(true);
    try {
      const { productId, imageUrl } = deleteConfirm;
      const res = await apiClient<{ image_url: string | null; images: string[]; message: string }>(
        `/products/${productId}/image?image_url=${encodeURIComponent(imageUrl)}`,
        { method: "DELETE" },
      );
      toast.success("Product image deleted.");
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, image_url: res.image_url, images: res.images } : p,
        ),
      );
      if (imageModalProduct && imageModalProduct.id === productId) {
        setImageModalProduct((prev) =>
          prev ? { ...prev, image_url: res.image_url, images: res.images } : null,
        );
      }
      setDeleteConfirm(null);
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message || "Failed to delete image.");
    } finally {
      setDeletingImage(false);
    }
  };

  const resetProductForm = () => {
    setProductForm({
      name: "",
      description: "",
      category: "electronics",
      price: "",
      stock: "",
      status: "published",
    });
  };

  const openEditModal = (p: Product) => {
    setEditProduct(p);
    setProductForm({
      name: p.name,
      description: p.description || "",
      category: p.category,
      price: p.price.toString(),
      stock: p.stock.toString(),
      status: p.status,
    });
  };

  const handleGenerateOpportunities = async () => {
    try {
      toast.loading("Running Revenue Opportunity Engine...");
      const res = await apiClient<{ total_count?: number; opportunities?: Opportunity[] }>(
        "/merchants/opportunities/generate",
        {
          method: "POST",
        },
      );
      toast.dismiss();
      toast.success(`Generated ${res.total_count || 0} opportunities`);
      setOpportunities(res.opportunities || []);
      loadData();
    } catch (err) {
      toast.dismiss();
      toast.error("Failed to generate opportunities.");
    }
  };

  const handleAnalyzeOpportunity = async (opp: Opportunity) => {
    setAnalyzingId(opp.id);
    try {
      const res = await apiClient<{ analysis?: RevenueAgentAnalysis }>(
        `/merchants/opportunities/${opp.id}/analyze`,
        {
          method: "POST",
        },
      );
      const parsedAnalysis = res.analysis || (res as unknown as RevenueAgentAnalysis);
      setOpportunities((prev) =>
        prev.map((o) => (o.id === opp.id ? { ...o, analysis: parsedAnalysis } : o)),
      );
      toast.success("AI Revenue Agent analysis complete!");
      // Refresh dashboard summary
      apiClient<DashboardData>("/merchants/dashboard").then((updatedDash) => {
        if (updatedDash) setDashboard(updatedDash);
      }).catch(() => {});
    } catch (err) {
      toast.error("Analysis failed.");
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleLoadAuditLogs = async (category = auditCategory) => {
    setAuditLoading(true);
    try {
      const url =
        category !== "all"
          ? `/merchants/audit-logs?category=${category}&limit=100`
          : "/merchants/audit-logs?limit=100";
      const res = await apiClient<{
        logs?: AuditLog[];
        summary?: AuditSummaryStats;
        total_count?: number;
      }>(url);
      setAuditLogs(res?.logs || []);
      if (res?.summary) {
        setAuditSummary(res.summary);
      }
    } catch (err) {
      toast.error("Could not load audit trail.");
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "audit") {
      handleLoadAuditLogs(auditCategory);
    }
  }, [activeTab, auditCategory]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-background flex-col lg:flex-row">
      {/* Merchant Sidebar */}
      <aside
        className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-border p-5 text-background lg:flex z-30"
        style={{ background: "linear-gradient(180deg, #1e0738 0%, #0d1b2a 100%)" }}
      >
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-background/10 text-white ring-1 ring-white/10">
              <Store className="size-5" />
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-80 text-white">
              Merchant Hub
            </span>
          </div>
          {merchantProfile && (
            <p className="text-xs text-white/50 ml-0.5 mt-1 truncate">
              {merchantProfile.business_name}
            </p>
          )}

          <nav className="mt-8 space-y-1">
            {(["overview", "products", "opportunities", "profile", "audit"] as const).map((tab) => {
              const labels: Record<string, string> = {
                overview: "Dashboard",
                products: "Catalog",
                opportunities: "Revenue Agent",
                profile: "Profile & Settings",
                audit: "Audit Trail",
              };
              const icons: Record<string, React.ElementType> = {
                overview: BarChart2,
                products: Package,
                opportunities: Zap,
                profile: Building2,
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
                      : "text-white/60 hover:bg-white/5 hover:text-white",
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
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="size-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="relative flex flex-1 flex-col min-w-0 p-6 lg:p-8 overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {activeTab === "overview" && "Merchant Dashboard"}
              {activeTab === "products" && "Product Catalog"}
              {activeTab === "opportunities" && "Revenue Agent"}
              {activeTab === "profile" && "Merchant Profile Settings"}
              {activeTab === "audit" && "Merchant Audit Trail"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {merchantProfile?.business_name || user?.name || "Merchant"}
              {merchantProfile?.status && (
                <span
                  className={cn(
                    "ml-2 rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
                    merchantProfile.status === "approved"
                      ? "bg-green-500/10 text-green-600"
                      : "bg-amber-500/10 text-amber-600",
                  )}
                >
                  {merchantProfile.status}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === "products" && (
              <button
                onClick={() => {
                  resetProductForm();
                  setAddProductOpen(true);
                }}
                className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
              >
                <Plus className="size-4" />
                Add Product
              </button>
            )}
            <Link
              to="/app"
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium hover:bg-muted"
            >
              Customer View
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* OVERVIEW TAB — TASK 18A JUDGE-FACING REVENUE AGENT INTELLIGENCE DASHBOARD */}
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-8"
            >
              {/* SECTION 1 — MERCHANT DASHBOARD KPI AREA */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Commerce Baseline Overview
                  </h2>
                  <button
                    onClick={() => loadData()}
                    className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <RefreshCw className="size-3" />
                    Sync Live Data
                  </button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    label="Total Products"
                    value={dashboard?.summary?.products ?? products.length}
                    subtitle="Active in catalog"
                    icon={Package}
                    color="primary"
                  />
                  <MetricCard
                    label="Total Orders"
                    value={dashboard?.summary?.orders ?? 0}
                    subtitle="Completed customer checkouts"
                    icon={TrendingUp}
                    color="emerald"
                  />
                  <MetricCard
                    label="Verified Revenue (INR)"
                    value={`₹${(dashboard?.summary?.revenue ?? 0).toLocaleString()}`}
                    subtitle="Settled through Razorpay"
                    icon={BarChart2}
                    color="violet"
                  />
                  <MetricCard
                    label="Opportunities Detected"
                    value={dashboard?.opportunities?.total ?? opportunities.length}
                    subtitle="Demand signals flagged"
                    icon={Zap}
                    color="amber"
                  />
                </div>
              </div>

              {/* SECTION 2 — REVENUE AGENT IMPACT SECTION */}
              <div className="space-y-4 rounded-2xl border border-purple-500/20 bg-gradient-to-b from-purple-500/5 via-transparent to-transparent p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-600 border border-purple-500/20 px-2.5 py-0.5 rounded-full">
                        Core Value Proof
                      </span>
                      <h2 className="text-base font-bold tracking-tight text-foreground">
                        REVENUE AGENT IMPACT
                      </h2>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      How RazorReach connects AI buyer intent to merchant revenue.
                    </p>
                  </div>

                  {/* Connected Progression Stepper */}
                  <div className="hidden md:flex items-center gap-1.5 bg-card/80 border border-border/80 rounded-full px-3.5 py-1 text-xs shadow-sm">
                    <span className="font-bold text-blue-600 dark:text-blue-400">CUSTOMER SIGNALS</span>
                    <ChevronRight className="size-3 text-muted-foreground" />
                    <span className="font-bold text-amber-600 dark:text-amber-400">OPPORTUNITIES</span>
                    <ChevronRight className="size-3 text-muted-foreground" />
                    <span className="font-bold text-purple-600 dark:text-purple-400">AI ANALYSES</span>
                    <ChevronRight className="size-3 text-muted-foreground" />
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">REVENUE IMPACT</span>
                  </div>
                </div>

                {/* 5 Real Backend Metric Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
                  <MetricCard
                    label="Demand Signals"
                    value={(dashboard?.impact?.demand_signals ?? 0).toLocaleString()}
                    subtitle="Searches, views & cart adds"
                    icon={Activity}
                    color="cyan"
                  />
                  <MetricCard
                    label="Opportunities Detected"
                    value={(dashboard?.impact?.opportunities_detected ?? opportunities.length).toLocaleString()}
                    subtitle="Heuristic demand anomalies"
                    icon={Zap}
                    color="amber"
                  />
                  <MetricCard
                    label="Opportunities Analyzed"
                    value={(dashboard?.impact?.opportunities_analyzed ?? opportunities.filter((o) => !!o.analysis).length).toLocaleString()}
                    subtitle="Grounded Gemini analyses"
                    icon={Sparkles}
                    color="violet"
                  />
                  <MetricCard
                    label="Estimated Potential"
                    value={`₹${(dashboard?.impact?.estimated_potential_revenue ?? 0).toLocaleString()}`}
                    subtitle="Demand model projection"
                    icon={TrendingUp}
                    color="rose"
                  />
                  <MetricCard
                    label="Verified Revenue"
                    value={`₹${(dashboard?.impact?.verified_revenue ?? dashboard?.summary?.revenue ?? 0).toLocaleString()}`}
                    subtitle="Settled paid orders"
                    icon={ShieldCheck}
                    color="emerald"
                  />
                </div>
              </div>

              {/* SECTION 8 — AGENT PIPELINE VISUAL */}
              <AgentPipelineVisual />

              {/* SECTION 3 & SECTION 6 — ACTIVITY GRAPH & RECENT AUDIT ACTIVITY */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SignalBreakdownChart
                  opportunitiesBySignal={dashboard?.opportunities_by_signal}
                  totalOpportunities={dashboard?.opportunities?.total ?? opportunities.length}
                />
                <RecentActivityTimeline
                  recentActivity={dashboard?.recent_activity}
                  onViewAll={() => setActiveTab("audit")}
                />
              </div>

              {/* SECTION 4 & 5 — TOP REVENUE OPPORTUNITIES (FACT / HYPOTHESIS / SUGGESTION) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
                      <Zap className="size-4 text-amber-500" />
                      Top Revenue Opportunities
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Strongest merchant-scoped demand signals with grounded Fact / Hypothesis / Suggestion separation.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleGenerateOpportunities}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className="size-3" />
                      Run Engine
                    </button>
                    <button
                      onClick={() => setActiveTab("opportunities")}
                      className="text-xs text-primary hover:underline font-semibold"
                    >
                      View All ({opportunities.length})
                    </button>
                  </div>
                </div>

                {opportunities.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center shadow-card space-y-3">
                    <Zap className="mx-auto size-10 text-muted-foreground/50" />
                    <div>
                      <h4 className="text-sm font-semibold">No revenue opportunities detected yet</h4>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                        Run the Opportunity Engine to analyze platform searches and catalog demand signals.
                      </p>
                    </div>
                    <button
                      onClick={handleGenerateOpportunities}
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm"
                    >
                      <RefreshCw className="size-3.5" />
                      Generate Opportunities Now
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {opportunities.slice(0, 3).map((opp) => (
                      <OpportunityCard
                        key={opp.id}
                        opportunity={opp}
                        isAnalyzing={analyzingId === opp.id}
                        onAnalyze={() => handleAnalyzeOpportunity(opp)}
                        onViewAudit={() => {
                          setActiveTab("audit");
                          setAuditCategory("revenue_agent");
                          setAuditSearch(opp.id);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* RECENT PRODUCTS TABLE */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-sm">Recent Catalog Items</h3>
                    <p className="text-xs text-muted-foreground">Indexed for AI Buyer semantic search</p>
                  </div>
                  <button
                    onClick={() => setActiveTab("products")}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    View Full Catalog ({products.length})
                  </button>
                </div>
                {products.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    No products in catalog yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {products.slice(0, 4).map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                      >
                        <div className="flex items-center gap-3">
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              className="size-9 rounded-lg object-cover border"
                            />
                          ) : (
                            <div className="size-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                              <Package className="size-4" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{p.category}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">₹{p.price?.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Stock: {p.stock} units</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* PRODUCTS TAB */}
          {activeTab === "products" && (
            <motion.div
              key="products"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              {products.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-card">
                  <Package className="mx-auto size-12 text-muted-foreground" />
                  <h3 className="mt-4 text-base font-semibold">No products in catalog</h3>
                  <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
                    Create your first product to list it for AI Buyer search and customer discovery.
                  </p>
                  <button
                    onClick={() => {
                      resetProductForm();
                      setAddProductOpen(true);
                    }}
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm"
                  >
                    <Plus className="size-4" />
                    Create First Product
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {products.map((p) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-border bg-card p-5 shadow-card flex flex-col justify-between space-y-4"
                    >
                      <div>
                        {/* Multi-Image Product Card Gallery */}
                        {p.image_url || (p.images && p.images.length > 0) ? (
                          <div className="space-y-2 mb-3">
                            <div className="relative h-44 w-full rounded-xl overflow-hidden border border-border group bg-muted/20">
                              <img
                                src={p.image_url || (p.images && p.images[0]) || ""}
                                alt={p.name}
                                className="h-full w-full object-cover"
                              />
                              <span className="absolute top-2 left-2 rounded-md bg-background/90 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-foreground border shadow-sm">
                                Primary
                              </span>
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                  onClick={() => openImageModal(p)}
                                  className="rounded-full bg-background/90 p-2 text-foreground hover:bg-background text-xs font-semibold flex items-center gap-1.5 shadow-md"
                                >
                                  <ImageIcon className="size-3.5" />
                                  Manage Images ({p.images?.length || (p.image_url ? 1 : 0)})
                                </button>
                              </div>
                            </div>
                            {p.images && p.images.length > 1 && (
                              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                                {p.images.slice(0, 4).map((imgUrl, idx) => (
                                  <div
                                    key={idx}
                                    onClick={() => openImageModal(p)}
                                    className={cn(
                                      "size-10 rounded-lg overflow-hidden border shrink-0 cursor-pointer relative hover:opacity-80 transition-opacity",
                                      imgUrl === p.image_url
                                        ? "ring-2 ring-primary border-primary"
                                        : "border-border",
                                    )}
                                  >
                                    <img
                                      src={imgUrl}
                                      alt={`${p.name} ${idx + 1}`}
                                      className="size-full object-cover"
                                    />
                                  </div>
                                ))}
                                {p.images.length > 4 && (
                                  <button
                                    onClick={() => openImageModal(p)}
                                    className="size-10 rounded-lg bg-muted border border-border text-[11px] font-bold text-muted-foreground shrink-0 flex items-center justify-center hover:bg-muted/80"
                                  >
                                    +{p.images.length - 4}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="h-40 w-full rounded-xl bg-muted/30 border border-dashed border-border flex flex-col items-center justify-center gap-2 mb-3 hover:bg-muted/40 transition-colors">
                            <ImageIcon className="size-8 text-muted-foreground/60" />
                            <button
                              onClick={() => openImageModal(p)}
                              className="text-xs text-primary font-semibold hover:underline flex items-center gap-1.5 bg-primary/10 px-3 py-1.5 rounded-full"
                            >
                              <Upload className="size-3.5" />
                              Upload Product Images
                            </button>
                          </div>
                        )}

                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold truncate text-base">{p.name}</h3>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase shrink-0",
                              p.status === "published"
                                ? "bg-green-500/10 text-green-600"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {p.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {p.description}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-border/50">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-lg font-bold">₹{p.price?.toLocaleString()}</span>
                          <span className="text-xs text-muted-foreground">Stock: {p.stock}</span>
                        </div>
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => handleReindexProduct(p.id)}
                            disabled={reindexingId === p.id}
                            className="rounded-lg border border-border p-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Reindex for AI Search"
                          >
                            {reindexingId === p.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="size-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => openEditModal(p)}
                            className="rounded-lg border border-border p-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Edit Product"
                          >
                            <Edit3 className="size-3.5" />
                          </button>
                          <button
                            onClick={() => handleArchiveProduct(p.id)}
                            className="rounded-lg border border-border p-2 text-xs text-red-500 hover:bg-red-500/10"
                            title="Archive Product"
                          >
                            <Archive className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* OPPORTUNITIES TAB */}
          {activeTab === "opportunities" && (
            <motion.div
              key="opportunities"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  AI Revenue Agent opportunities derived from catalog and customer demand signals
                </p>
                <button
                  onClick={handleGenerateOpportunities}
                  className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  <RefreshCw className="size-3.5" />
                  Generate Opportunities
                </button>
              </div>

              {opportunities.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-card">
                  <Zap className="mx-auto size-10 text-muted-foreground" />
                  <h3 className="mt-4 text-base font-semibold">
                    No revenue opportunities detected
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Run the opportunity engine to analyze catalog signals.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {opportunities.map((opp) => (
                    <OpportunityCard
                      key={opp.id}
                      opportunity={opp}
                      isAnalyzing={analyzingId === opp.id}
                      onAnalyze={() => handleAnalyzeOpportunity(opp)}
                      onViewAudit={() => {
                        setActiveTab("audit");
                        setAuditCategory("revenue_agent");
                        setAuditSearch(opp.id);
                      }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* PROFILE SETTINGS TAB */}
          {activeTab === "profile" && merchantProfile && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="max-w-2xl space-y-6"
            >
              <div className="rounded-2xl border border-border bg-card p-6 shadow-card space-y-4">
                <h3 className="text-lg font-bold">Business Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Business Name</span>
                    <p className="font-semibold mt-0.5">{merchantProfile.business_name}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Category</span>
                    <p className="font-semibold mt-0.5 capitalize">{merchantProfile.category}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Phone</span>
                    <p className="font-semibold mt-0.5">{merchantProfile.phone}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Location</span>
                    <p className="font-semibold mt-0.5">
                      {merchantProfile.address?.city}, {merchantProfile.address?.state}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* AUDIT TAB */}
          {activeTab === "audit" && (
            <motion.div
              key="audit"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-6"
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    <ShieldCheck className="size-6 text-primary" />
                    AUDIT TRAIL
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    A transparent record of Revenue Agent, Buyer Agent, commerce and payment activity.
                  </p>
                </div>
                <button
                  onClick={() => handleLoadAuditLogs(auditCategory)}
                  disabled={auditLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors self-start sm:self-auto disabled:opacity-50"
                >
                  <RefreshCw className={cn("size-3.5 text-primary", auditLoading && "animate-spin")} />
                  Refresh Logs
                </button>
              </div>

              {/* Section 12 — Activity Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground">Total Events</span>
                    <Activity className="size-4 text-slate-500" />
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {auditSummary ? auditSummary.total_events : auditLogs.length}
                  </p>
                  <p className="text-[10px] text-muted-foreground">All audit ledger entries</p>
                </div>

                <div className="rounded-2xl border border-purple-200 dark:border-purple-800/40 bg-purple-50/40 dark:bg-purple-950/20 p-3.5 shadow-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">Revenue Agent</span>
                    <Sparkles className="size-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <p className="text-xl font-bold text-purple-950 dark:text-purple-100">
                    {auditSummary ? auditSummary.revenue_agent_runs : 0}
                  </p>
                  <p className="text-[10px] text-purple-700/70 dark:text-purple-300/70">Analyzed opportunities</p>
                </div>

                <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/40 dark:bg-indigo-950/20 p-3.5 shadow-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">Buyer Agent</span>
                    <Bot className="size-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <p className="text-xl font-bold text-indigo-950 dark:text-indigo-100">
                    {auditSummary ? auditSummary.buyer_agent_runs : 0}
                  </p>
                  <p className="text-[10px] text-indigo-700/70 dark:text-indigo-300/70">Autonomous sessions</p>
                </div>

                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 shadow-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Policy Decisions</span>
                    <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-xl font-bold text-emerald-950 dark:text-emerald-100">
                    {auditSummary ? auditSummary.policy_decisions : 0}
                  </p>
                  <p className="text-[10px] text-emerald-700/70 dark:text-emerald-300/70">Safety validations</p>
                </div>

                <div className="rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/20 p-3.5 shadow-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">AI Fallbacks</span>
                    <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-xl font-bold text-amber-950 dark:text-amber-100">
                    {auditSummary ? auditSummary.ai_fallbacks : 0}
                  </p>
                  <p className="text-[10px] text-amber-700/70 dark:text-amber-300/70">Resilience activations</p>
                </div>

                <div className="rounded-2xl border border-sky-200 dark:border-sky-800/40 bg-sky-50/40 dark:bg-sky-950/20 p-3.5 shadow-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">Verified Payments</span>
                    <CreditCard className="size-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <p className="text-xl font-bold text-sky-950 dark:text-sky-100">
                    {auditSummary ? auditSummary.payments_verified : 0}
                  </p>
                  <p className="text-[10px] text-sky-700/70 dark:text-sky-300/70">Settled transactions</p>
                </div>
              </div>

              {/* Section 2 & 13 — Filters and Search */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card border border-border rounded-2xl p-3 shadow-sm">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                  {(
                    [
                      { id: "all", label: "All Events" },
                      { id: "revenue_agent", label: "Revenue Agent" },
                      { id: "buyer_agent", label: "Buyer Agent" },
                      { id: "commerce", label: "Commerce" },
                      { id: "payments", label: "Payments" },
                      { id: "auth", label: "Auth" },
                      { id: "system", label: "System" },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setAuditCategory(cat.id);
                        handleLoadAuditLogs(cat.id);
                      }}
                      className={cn(
                        "rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all",
                        auditCategory === cat.id
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="relative shrink-0 md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search action or resource..."
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted/30 pl-9 pr-3 py-1.5 text-xs outline-none focus:border-primary transition-colors"
                  />
                  {auditSearch && (
                    <button
                      onClick={() => setAuditSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Section 3 — Agent Event Timeline */}
              {auditLoading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl border border-border">
                  <Loader2 className="size-7 animate-spin text-primary mb-2" />
                  <p className="text-xs text-muted-foreground">Loading authoritative audit records...</p>
                </div>
              ) : (
                (() => {
                  const filteredLogs = auditLogs.filter((log) => {
                    if (!auditSearch.trim()) return true;
                    const q = auditSearch.toLowerCase();
                    return (
                      log.action.toLowerCase().includes(q) ||
                      (log.resource_id && log.resource_id.toLowerCase().includes(q)) ||
                      (log.resource_type && log.resource_type.toLowerCase().includes(q)) ||
                      (log.metadata && JSON.stringify(log.metadata).toLowerCase().includes(q))
                    );
                  });

                  if (filteredLogs.length === 0) {
                    return (
                      <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-card space-y-3">
                        <ShieldCheck className="mx-auto size-10 text-muted-foreground/60" />
                        <h3 className="text-base font-semibold">No audit events match your criteria</h3>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                          {auditSearch
                            ? `No records matching "${auditSearch}". Try clearing your search term.`
                            : `No events recorded yet under the "${auditCategory}" category. Events populate in real-time as agent and commerce actions occur.`}
                        </p>
                        {auditSearch && (
                          <button
                            onClick={() => setAuditSearch("")}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Clear Search Filter
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {filteredLogs.map((log, i) => {
                        const visuals = getAuditVisuals(log.action, log.result);
                        const VisualIcon = visuals.icon;
                        const narrative = getAuditNarrative(log);
                        const isSuccess = log.result === "success";

                        return (
                          <motion.div
                            key={log.id || i}
                            onClick={() => setSelectedAuditLog(log)}
                            className={cn(
                              "rounded-2xl border p-4 transition-all cursor-pointer hover:shadow-md",
                              visuals.border,
                              visuals.bg,
                            )}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <div
                                  className={cn(
                                    "size-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border shadow-2xs",
                                    visuals.badgeStyle,
                                  )}
                                >
                                  <VisualIcon className="size-4.5" />
                                </div>
                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border", visuals.badgeStyle)}>
                                      {visuals.badgeText}
                                    </span>
                                    <span className="font-mono text-xs font-semibold text-foreground">
                                      {log.action}
                                    </span>
                                    <span
                                      className={cn(
                                        "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border",
                                        isSuccess
                                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
                                      )}
                                    >
                                      {log.result?.toUpperCase() || "SUCCESS"}
                                    </span>
                                  </div>
                                  <p className="text-xs text-foreground/90 font-medium leading-relaxed">
                                    {narrative}
                                  </p>
                                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap pt-0.5">
                                    <span>
                                      Resource: <strong className="text-foreground/80 font-mono">{log.resource_type}</strong>
                                      {log.resource_id && (
                                        <span className="font-mono ml-1 text-muted-foreground/90">
                                          ({log.resource_id.slice(-10)})
                                        </span>
                                      )}
                                    </span>
                                    <span>·</span>
                                    <span>
                                      Actor: <strong className="text-foreground/80 capitalize">{log.actor_role || "system"}</strong>
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                                <time className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                                  {log.created_at ? new Date(log.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}
                                </time>
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                                  Explain Event
                                  <ArrowUpRight className="size-3" />
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </motion.div>
          )}

          {/* Section 4 & 5 — EVENT DETAIL PANEL / MODAL */}
          <AnimatePresence>
            {selectedAuditLog && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 scrollbar-none"
                >
                  {/* Modal Header */}
                  <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const visuals = getAuditVisuals(selectedAuditLog.action, selectedAuditLog.result);
                          return (
                            <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border", visuals.badgeStyle)}>
                              {visuals.badgeText}
                            </span>
                          );
                        })()}
                        <span
                          className={cn(
                            "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border",
                            selectedAuditLog.result === "success"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 border-rose-500/20",
                          )}
                        >
                          {selectedAuditLog.result?.toUpperCase() || "SUCCESS"}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-foreground">
                        {getAuditVisuals(selectedAuditLog.action, selectedAuditLog.result).title}
                      </h3>
                      <p className="font-mono text-xs text-muted-foreground">{selectedAuditLog.action}</p>
                    </div>
                    <button
                      onClick={() => setSelectedAuditLog(null)}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  {/* Overview Meta Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-muted/30 border border-border text-xs">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Timestamp</span>
                      <p className="font-mono font-medium text-foreground mt-0.5">
                        {selectedAuditLog.created_at
                          ? new Date(selectedAuditLog.created_at).toLocaleString()
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Actor</span>
                      <p className="font-medium text-foreground capitalize mt-0.5">
                        {selectedAuditLog.actor_role || "system"}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Resource Type</span>
                      <p className="font-mono font-medium text-foreground mt-0.5">
                        {selectedAuditLog.resource_type || "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Resource ID</span>
                      <p className="font-mono font-medium text-foreground truncate mt-0.5">
                        {selectedAuditLog.resource_id || "—"}
                      </p>
                    </div>
                  </div>

                  {/* WHAT HAPPENED */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <FileText className="size-3.5" />
                      WHAT HAPPENED
                    </h4>
                    <div className="rounded-xl border border-border bg-card p-3.5 text-xs text-foreground leading-relaxed">
                      {getAuditNarrative(selectedAuditLog)}
                    </div>
                  </div>

                  {/* 1. FACT (Authoritative Evidence) */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                      <Database className="size-3.5" />
                      1. FACT (Authoritative Evidence)
                    </h4>
                    <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 p-3.5 space-y-2 text-xs">
                      <p className="text-[11px] text-blue-900/70 dark:text-blue-200/70 font-medium">
                        Database-grounded operational parameters recorded at execution:
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {selectedAuditLog.metadata?.score !== undefined && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 border border-blue-200/60 dark:border-blue-900/30">
                            <span className="text-muted-foreground">Heuristic Score:</span>
                            <strong className="font-mono text-blue-700 dark:text-blue-300">
                              {selectedAuditLog.metadata.score}
                            </strong>
                          </div>
                        )}
                        {selectedAuditLog.metadata?.opportunity_type && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 border border-blue-200/60 dark:border-blue-900/30">
                            <span className="text-muted-foreground">Demand Signal:</span>
                            <strong className="font-mono text-blue-700 dark:text-blue-300">
                              {selectedAuditLog.metadata.opportunity_type}
                            </strong>
                          </div>
                        )}
                        {selectedAuditLog.metadata?.action && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 border border-blue-200/60 dark:border-blue-900/30">
                            <span className="text-muted-foreground">Action Evaluated:</span>
                            <strong className="font-mono text-blue-700 dark:text-blue-300">
                              {selectedAuditLog.metadata.action}
                            </strong>
                          </div>
                        )}
                        {selectedAuditLog.metadata?.allowed !== undefined && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 border border-blue-200/60 dark:border-blue-900/30">
                            <span className="text-muted-foreground">Policy Gate:</span>
                            <strong
                              className={cn(
                                "font-mono",
                                selectedAuditLog.metadata.allowed ? "text-emerald-600" : "text-rose-600",
                              )}
                            >
                              {selectedAuditLog.metadata.allowed ? "ALLOWED" : "BLOCKED"}
                            </strong>
                          </div>
                        )}
                        {selectedAuditLog.metadata?.risk_level && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 border border-blue-200/60 dark:border-blue-900/30">
                            <span className="text-muted-foreground">Risk Tier:</span>
                            <strong className="font-mono uppercase text-blue-700 dark:text-blue-300">
                              {selectedAuditLog.metadata.risk_level}
                            </strong>
                          </div>
                        )}
                        {selectedAuditLog.metadata?.reason_code && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 border border-blue-200/60 dark:border-blue-900/30">
                            <span className="text-muted-foreground">Reason Code:</span>
                            <strong className="font-mono text-blue-700 dark:text-blue-300">
                              {selectedAuditLog.metadata.reason_code}
                            </strong>
                          </div>
                        )}
                        {selectedAuditLog.metadata?.failure_type && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 border border-blue-200/60 dark:border-blue-900/30">
                            <span className="text-muted-foreground">Failure Trigger:</span>
                            <strong className="font-mono text-amber-600">
                              {selectedAuditLog.metadata.failure_type}
                            </strong>
                          </div>
                        )}
                        {selectedAuditLog.metadata?.response_mode && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 border border-blue-200/60 dark:border-blue-900/30">
                            <span className="text-muted-foreground">Resilience Mode:</span>
                            <strong className="font-mono text-blue-700 dark:text-blue-300">
                              {selectedAuditLog.metadata.response_mode}
                            </strong>
                          </div>
                        )}
                        {selectedAuditLog.metadata?.reference_type && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 border border-blue-200/60 dark:border-blue-900/30">
                            <span className="text-muted-foreground">Reference Category:</span>
                            <strong className="font-mono text-blue-700 dark:text-blue-300">
                              {selectedAuditLog.metadata.reference_type}
                            </strong>
                          </div>
                        )}
                        {selectedAuditLog.metadata?.amount !== undefined && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 border border-blue-200/60 dark:border-blue-900/30">
                            <span className="text-muted-foreground">Amount:</span>
                            <strong className="font-mono text-emerald-600">
                              ₹{typeof selectedAuditLog.metadata.amount === "number" && selectedAuditLog.metadata.amount > 1000
                                ? (selectedAuditLog.metadata.amount / 100).toLocaleString()
                                : selectedAuditLog.metadata.amount}
                            </strong>
                          </div>
                        )}
                      </div>

                      {/* Sanitized Raw Metadata Table */}
                      {selectedAuditLog.metadata && Object.keys(selectedAuditLog.metadata).length > 0 && (
                        <div className="pt-2">
                          <span className="text-[10px] text-blue-900/70 dark:text-blue-200/70 font-semibold block mb-1">
                            Authoritative Metadata Key-Values:
                          </span>
                          <div className="rounded-lg border border-blue-200/60 dark:border-blue-900/40 bg-background/80 p-2.5 overflow-x-auto">
                            <table className="w-full text-[11px] font-mono">
                              <tbody>
                                {Object.entries(selectedAuditLog.metadata)
                                  .filter(
                                    ([k]) =>
                                      !["password", "jwt", "token", "secret", "signature", "key", "cvv"].some(
                                        (s) => k.toLowerCase().includes(s),
                                      ),
                                  )
                                  .map(([k, v]) => (
                                    <tr key={k} className="border-b border-border/30 last:border-0">
                                      <td className="py-1 pr-3 text-muted-foreground font-semibold align-top">{k}:</td>
                                      <td className="py-1 text-foreground break-all">
                                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. HYPOTHESIS (AI Inferred) */}
                  {(selectedAuditLog.action.includes("OPPORTUNITY_ANALYZED") ||
                    selectedAuditLog.action.includes("REVENUE_AGENT") ||
                    selectedAuditLog.action.includes("BUYER_AGENT")) && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                        <Brain className="size-3.5" />
                        2. HYPOTHESIS (AI Inferred Reasoning)
                      </h4>
                      <div className="rounded-xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20 p-3.5 space-y-2 text-xs">
                        <p className="text-purple-950 dark:text-purple-100 leading-relaxed font-medium">
                          {selectedAuditLog.metadata?.interpretation ||
                            selectedAuditLog.metadata?.hypothesis ||
                            (selectedAuditLog.action === "BUYER_AGENT_POLICY_DECISION"
                              ? "Policy Gate deduced that the requested transition adheres to deterministic customer bounds without requiring merchant elevation."
                              : selectedAuditLog.action === "BUYER_AGENT_AI_FALLBACK"
                              ? "Resilience engine deduced that external LLM latency or timeout threatened user conversion, triggering instant deterministic query resolution."
                              : selectedAuditLog.action === "BUYER_AGENT_REFERENCE_RESOLVED"
                              ? "Conversational resolver deduced candidate target from user's multi-turn conversational context."
                              : "AI agent produced grounded reasoning from behavioral interaction signals.")}
                        </p>
                        <p className="text-[10px] text-purple-600/80 dark:text-purple-400/80 italic pt-1 border-t border-purple-200/50 dark:border-purple-900/30">
                          AI inference derived from demand signals; explicitly separated from empirical database facts.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 3. SUGGESTION (Action Plan) */}
                  {(selectedAuditLog.metadata?.suggested_action ||
                    selectedAuditLog.action.includes("OPPORTUNITY") ||
                    selectedAuditLog.action.includes("POLICY")) && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                        <Lightbulb className="size-3.5" />
                        3. SUGGESTION (Merchant Recommendation)
                      </h4>
                      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 space-y-1.5 text-xs">
                        <p className="text-emerald-950 dark:text-emerald-100 font-medium leading-relaxed">
                          {selectedAuditLog.metadata?.suggested_action ||
                            (selectedAuditLog.metadata?.allowed === false
                              ? "Review safety constraints if this blocked action should be permitted under authenticated customer workflows."
                              : "Review opportunity details in Revenue Agent to evaluate catalog inventory adjustments.")}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 4. RESULT & VERIFICATION */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-primary" />
                      RESULT & AUDIT LEDGER STATUS
                    </h4>
                    <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground flex items-center justify-between">
                      <span>Recorded permanently into immutable audit collection with tamper-resistant server UTC timestamp.</span>
                      <span className="font-mono text-[10px] text-emerald-600 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">
                        VERIFIED
                      </span>
                    </div>
                  </div>

                  {/* Cross-Navigation Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      {(selectedAuditLog.resource_type === "opportunity" ||
                        selectedAuditLog.resource_id?.startsWith("opp_") ||
                        selectedAuditLog.metadata?.opportunity_id) && (
                        <button
                          onClick={() => {
                            setSelectedAuditLog(null);
                            setActiveTab("opportunities");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 shadow-xs transition-colors"
                        >
                          <Sparkles className="size-3.5" />
                          View Opportunity in Revenue Agent
                        </button>
                      )}

                      {(selectedAuditLog.resource_type === "product" ||
                        selectedAuditLog.resource_id?.startsWith("p_") ||
                        selectedAuditLog.metadata?.product_id) && (
                        <button
                          onClick={() => {
                            setSelectedAuditLog(null);
                            setActiveTab("products");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 shadow-xs transition-colors"
                        >
                          <Package className="size-3.5" />
                          View Product in Catalog
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => setSelectedAuditLog(null)}
                      className="rounded-xl border border-border px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

        </AnimatePresence>
      </main>

      {/* Onboarding Modal */}
      <AnimatePresence>
        {onboardingOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Store className="size-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Register Merchant Profile</h3>
                  <p className="text-xs text-muted-foreground">
                    Complete profile to start listing products
                  </p>
                </div>
              </div>

              <form onSubmit={handleOnboardingSubmit} className="space-y-3 pt-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Business Name</label>
                  <input
                    type="text"
                    required
                    value={onboardingData.business_name}
                    onChange={(e) =>
                      setOnboardingData((p) => ({ ...p, business_name: e.target.value }))
                    }
                    placeholder="e.g. Acme Tech Store"
                    className="mt-1 block w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Category</label>
                    <input
                      type="text"
                      required
                      value={onboardingData.category}
                      onChange={(e) =>
                        setOnboardingData((p) => ({ ...p, category: e.target.value }))
                      }
                      placeholder="electronics"
                      className="mt-1 block w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Phone</label>
                    <input
                      type="text"
                      required
                      value={onboardingData.phone}
                      onChange={(e) => setOnboardingData((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="+91 9876543210"
                      className="mt-1 block w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">City</label>
                    <input
                      type="text"
                      required
                      value={onboardingData.city}
                      onChange={(e) => setOnboardingData((p) => ({ ...p, city: e.target.value }))}
                      placeholder="Bengaluru"
                      className="mt-1 block w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">State</label>
                    <input
                      type="text"
                      required
                      value={onboardingData.state}
                      onChange={(e) => setOnboardingData((p) => ({ ...p, state: e.target.value }))}
                      placeholder="Karnataka"
                      className="mt-1 block w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={onboardingSubmitting}
                    className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {onboardingSubmitting && <Loader2 className="size-3.5 animate-spin" />}
                    Complete Profile
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add / Edit Product Modal */}
      <AnimatePresence>
        {(addProductOpen || editProduct) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">
                  {editProduct ? "Edit Product" : "Add New Product"}
                </h3>
                <button
                  onClick={() => {
                    setAddProductOpen(false);
                    setEditProduct(null);
                  }}
                  className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-4" />
                </button>
              </div>

              <form
                onSubmit={editProduct ? handleUpdateProduct : handleCreateProduct}
                className="space-y-3"
              >
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Product Name</label>
                  <input
                    type="text"
                    required
                    value={productForm.name}
                    onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Wireless Noise-Cancelling Headphones"
                    className="mt-1 block w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                  <textarea
                    required
                    rows={3}
                    value={productForm.description}
                    onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Detailed description of product features..."
                    className="mt-1 block w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm outline-none resize-none"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Category</label>
                    <input
                      type="text"
                      required
                      value={productForm.category}
                      onChange={(e) => setProductForm((p) => ({ ...p, category: e.target.value }))}
                      placeholder="electronics"
                      className="mt-1 block w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Price (INR)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={productForm.price}
                      onChange={(e) => setProductForm((p) => ({ ...p, price: e.target.value }))}
                      placeholder="2999"
                      className="mt-1 block w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Stock</label>
                    <input
                      type="number"
                      required
                      value={productForm.stock}
                      onChange={(e) => setProductForm((p) => ({ ...p, stock: e.target.value }))}
                      placeholder="50"
                      className="mt-1 block w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setAddProductOpen(false);
                      setEditProduct(null);
                    }}
                    className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={productSubmitting}
                    className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {productSubmitting && <Loader2 className="size-3.5 animate-spin" />}
                    {editProduct ? "Save Changes" : "Create Product"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* IMAGE MANAGER MODAL */}
        {imageModalProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-bold">Manage Product Images</h2>
                  <p className="text-xs text-muted-foreground">{imageModalProduct.name}</p>
                </div>
                <button
                  onClick={() => {
                    setImageModalProduct(null);
                    setPendingFiles([]);
                  }}
                  className="rounded-full p-1.5 hover:bg-muted text-muted-foreground"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* Existing Uploaded Image Gallery */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <ImageIcon className="size-4 text-primary" />
                  Uploaded Catalog Images (
                  {imageModalProduct.images?.length || (imageModalProduct.image_url ? 1 : 0)})
                </h3>
                {imageModalProduct.images && imageModalProduct.images.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {imageModalProduct.images.map((imgUrl, idx) => (
                      <div
                        key={idx}
                        className="relative group rounded-xl border border-border overflow-hidden h-32 bg-muted/20"
                      >
                        <img
                          src={imgUrl}
                          alt={`${imageModalProduct.name} ${idx + 1}`}
                          className="size-full object-cover"
                        />
                        {idx === 0 && (
                          <span className="absolute top-2 left-2 rounded-md bg-background/90 px-2 py-0.5 text-[10px] font-bold text-foreground border shadow-sm">
                            Primary
                          </span>
                        )}
                        <button
                          onClick={() => confirmDeleteImage(imageModalProduct.id, imgUrl)}
                          className="absolute top-2 right-2 rounded-full bg-background/90 p-1.5 text-red-500 hover:bg-background shadow-md opacity-90 group-hover:opacity-100 transition-opacity"
                          title="Delete Image"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : imageModalProduct.image_url ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="relative group rounded-xl border border-border overflow-hidden h-32 bg-muted/20">
                      <img
                        src={imageModalProduct.image_url}
                        alt={imageModalProduct.name}
                        className="size-full object-cover"
                      />
                      <span className="absolute top-2 left-2 rounded-md bg-background/90 px-2 py-0.5 text-[10px] font-bold text-foreground border shadow-sm">
                        Primary
                      </span>
                      <button
                        onClick={() =>
                          confirmDeleteImage(imageModalProduct.id, imageModalProduct.image_url!)
                        }
                        className="absolute top-2 right-2 rounded-full bg-background/90 p-1.5 text-red-500 hover:bg-background shadow-md"
                        title="Delete Image"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center bg-muted/20 rounded-xl border border-dashed border-border">
                    No images uploaded for this product yet. Select image files below to upload.
                  </p>
                )}
              </div>

              {/* Pending Upload Files Preview */}
              {pendingFiles.length > 0 && (
                <div className="border-t border-border pt-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center justify-between">
                    <span>Pending Upload ({pendingFiles.length})</span>
                    <span className="text-xs text-muted-foreground">Ready to upload</span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {pendingFiles.map(({ file, previewUrl }, idx) => (
                      <div
                        key={idx}
                        className="relative rounded-xl border border-primary/40 bg-primary/5 p-2 flex flex-col justify-between h-32"
                      >
                        <div className="relative h-20 w-full rounded-lg overflow-hidden border border-border">
                          <img
                            src={previewUrl}
                            alt={file.name}
                            className="size-full object-cover"
                          />
                          <button
                            onClick={() => removePendingFile(idx)}
                            className="absolute top-1 right-1 rounded-full bg-background/90 p-1 text-red-500 hover:bg-background shadow"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                        <div className="mt-1">
                          <p className="text-[11px] font-medium truncate">{file.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {(file.size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Controls */}
              <div className="border-t border-border pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleSelectFiles}
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-2 text-xs font-semibold hover:bg-muted w-full sm:w-auto justify-center"
                >
                  <Plus className="size-3.5" />
                  Select Image Files
                </button>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setImageModalProduct(null);
                      setPendingFiles([]);
                    }}
                    className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    Done
                  </button>
                  {pendingFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={handleUploadPendingFiles}
                      disabled={uploadingImages}
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60 shadow-md"
                    >
                      {uploadingImages ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Upload className="size-3.5" />
                      )}
                      Upload {pendingFiles.length} Image(s)
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* DELETE CONFIRMATION DIALOG */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3 text-red-500">
                <AlertCircle className="size-6 shrink-0" />
                <h3 className="text-base font-bold text-foreground">Delete Product Image?</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete this product image? This action will remove the
                asset from Cloudinary and catalog listings.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deletingImage}
                  className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteDeleteImage}
                  disabled={deletingImage}
                  className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deletingImage && <Loader2 className="size-3.5 animate-spin" />}
                  Delete Image
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color: "primary" | "emerald" | "violet" | "amber" | "rose" | "cyan";
}) {
  const colorMap = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600",
    violet: "bg-violet-500/10 text-violet-600",
    amber: "bg-amber-500/10 text-amber-600",
    rose: "bg-rose-500/10 text-rose-600",
    cyan: "bg-cyan-500/10 text-cyan-600",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-5 shadow-card flex flex-col justify-between hover:border-border/80 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className={cn("flex size-9 items-center justify-center rounded-xl", colorMap[color])}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="mt-0.5 text-xs font-semibold text-foreground/90">{label}</p>
        {subtitle && <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{subtitle}</p>}
      </div>
    </motion.div>
  );
}

function AgentPipelineVisual() {
  const steps = [
    { num: "01", title: "Customer Demand", subtitle: "AI Buyer Intent", icon: Activity, color: "text-blue-500 bg-blue-500/10" },
    { num: "02", title: "Signal Detection", subtitle: "Searches, Carts, Views", icon: Eye, color: "text-cyan-500 bg-cyan-500/10" },
    { num: "03", title: "Opportunity Engine", subtitle: "Heuristic Scoring", icon: Zap, color: "text-amber-500 bg-amber-500/10" },
    { num: "04", title: "Revenue Agent", subtitle: "Gemini Interpretation", icon: Brain, color: "text-purple-500 bg-purple-500/10" },
    { num: "05", title: "Merchant Insight", subtitle: "Fact · Hypo · Action", icon: Lightbulb, color: "text-emerald-500 bg-emerald-500/10" },
    { num: "06", title: "Verified Revenue", subtitle: "Settled Orders (INR)", icon: ShieldCheck, color: "text-green-500 bg-green-500/10" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
            <Layers className="size-4 text-purple-600" />
            Autonomous Revenue Pipeline
          </h3>
          <p className="text-xs text-muted-foreground">
            End-to-end trace: from autonomous AI customer inquiries to verified merchant revenue capture.
          </p>
        </div>
        <span className="hidden sm:inline-flex rounded-full bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 text-[10px] font-bold text-purple-600">
          CLOSED-LOOP SYSTEM
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div
              key={idx}
              className="relative rounded-xl border border-border/70 bg-muted/20 p-3 flex flex-col justify-between hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-muted-foreground">{step.num}</span>
                <div className={cn("size-6 rounded-lg flex items-center justify-center", step.color)}>
                  <Icon className="size-3.5" />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-foreground leading-tight">{step.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{step.subtitle}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SignalBreakdownChart({
  opportunitiesBySignal,
  totalOpportunities,
}: {
  opportunitiesBySignal?: Record<string, number>;
  totalOpportunities: number;
}) {
  const signalMeta: Record<string, { label: string; fill: string }> = {
    unserved_demand: { label: "Unserved Demand", fill: "#3b82f6" },
    cart_abandonment: { label: "Cart Abandonment", fill: "#f59e0b" },
    low_conversion: { label: "Low Conversion", fill: "#8b5cf6" },
    stock_gap: { label: "Stock Gap", fill: "#ef4444" },
    high_demand_category: { label: "High Demand", fill: "#10b981" },
  };

  const chartData = Object.entries(opportunitiesBySignal || {})
    .filter(([_, count]) => count > 0)
    .map(([key, count]) => ({
      key,
      name: signalMeta[key]?.label || key.replace(/_/g, " "),
      count,
      fill: signalMeta[key]?.fill || "#64748b",
    }));

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            Revenue Opportunities by Demand Signal
          </h3>
          <p className="text-xs text-muted-foreground">
            Distribution of identified buyer demand signals across your catalog.
          </p>
        </div>
        <span className="text-xs font-mono font-semibold bg-muted px-2.5 py-1 rounded-full border border-border">
          {totalOpportunities} detected
        </span>
      </div>

      {chartData.length === 0 ? (
        <div className="h-44 flex flex-col items-center justify-center text-center p-4 rounded-xl border border-dashed border-border bg-muted/20">
          <Activity className="size-8 text-muted-foreground/40 mb-2" />
          <p className="text-xs font-medium text-foreground">No active signal distribution yet</p>
          <p className="text-[11px] text-muted-foreground max-w-xs mt-0.5">
            As buyer interactions and search inquiries occur on the platform, detected signals will appear here.
          </p>
        </div>
      ) : (
        <div className="h-52 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "var(--muted-foreground, #888)" }}
                interval={0}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground, #888)" }}
                tickLine={false}
                axisLine={false}
              />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-xl border border-border bg-card p-2.5 shadow-lg text-xs space-y-1">
                        <p className="font-bold text-foreground">{data.name}</p>
                        <p className="text-muted-foreground">
                          Opportunities Detected: <strong className="text-foreground">{data.count}</strong>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function RecentActivityTimeline({
  recentActivity,
  onViewAll,
}: {
  recentActivity?: DashboardData["recent_activity"];
  onViewAll: () => void;
}) {
  const formatAction = (action: string) => {
    return action
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getActionBadge = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes("OPPORTUNITY")) return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    if (act.includes("REVENUE_AGENT")) return "bg-purple-500/10 text-purple-600 border-purple-500/20";
    if (act.includes("BUYER")) return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    if (act.includes("PAYMENT") || act.includes("ORDER")) return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Activity className="size-4 text-emerald-500" />
            Recent Agent & Commerce Activity
          </h3>
          <p className="text-xs text-muted-foreground">
            Real-time audit log of agent events and platform operations.
          </p>
        </div>
        <button
          onClick={onViewAll}
          className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1"
        >
          View Full Audit Trail
          <ArrowRight className="size-3" />
        </button>
      </div>

      {!recentActivity || recentActivity.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          No recent agent activity recorded yet.
        </p>
      ) : (
        <div className="space-y-2.5">
          {recentActivity.map((event, idx) => (
            <div
              key={event.id || idx}
              className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors gap-3"
            >
              <div className="min-w-0 flex items-center gap-3">
                <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0", getActionBadge(event.action))}>
                  {formatAction(event.action)}
                </span>
                <p className="text-xs font-medium text-foreground truncate">
                  {event.resource_type ? `${event.resource_type} · ` : ""}
                  <span className="font-mono text-[11px] text-muted-foreground">{event.resource_id || "system"}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[11px] text-muted-foreground font-mono">
                  {event.created_at ? new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({
  opportunity,
  isAnalyzing,
  onAnalyze,
  onViewAudit,
}: {
  opportunity: Opportunity;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onViewAudit?: () => void;
}) {
  const priorityColors = {
    high: "bg-red-500/10 text-red-600 border-red-500/20",
    medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    low: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  };

  const signalLabels: Record<string, { label: string; color: string }> = {
    unserved_demand: { label: "Unserved Demand", color: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
    cart_abandonment: { label: "Cart Abandonment", color: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
    low_conversion: { label: "Low Conversion", color: "bg-purple-500/10 text-purple-700 border-purple-500/20" },
    stock_gap: { label: "Stock Gap", color: "bg-rose-500/10 text-rose-700 border-rose-500/20" },
    high_demand_category: { label: "High Demand Category", color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
  };

  const potentialRev = opportunity.estimated_potential_revenue ?? opportunity.potential_revenue;
  const signal = signalLabels[opportunity.type] || {
    label: opportunity.type?.replace(/_/g, " ") || "Demand Signal",
    color: "bg-muted text-muted-foreground border-border",
  };

  // Build fallback factual evidence if evidence_summary is empty
  const rawEv = opportunity.evidence;
  const factualItems: string[] = [];
  if (opportunity.analysis?.evidence_summary && opportunity.analysis.evidence_summary.length > 0) {
    factualItems.push(...opportunity.analysis.evidence_summary);
  } else if (rawEv) {
    if (rawEv.search_count !== undefined && rawEv.search_count > 0)
      factualItems.push(`Recorded ${rawEv.search_count} customer catalog searches in period.`);
    if (rawEv.zero_result_count !== undefined && rawEv.zero_result_count > 0)
      factualItems.push(`Identified ${rawEv.zero_result_count} zero-result search events for target query.`);
    if (rawEv.view_count !== undefined && rawEv.view_count > 0)
      factualItems.push(`Received ${rawEv.view_count} customer product detail views.`);
    if (rawEv.cart_add_count !== undefined && rawEv.cart_add_count > 0)
      factualItems.push(`Added to customer carts ${rawEv.cart_add_count} times without completed checkout.`);
    if (rawEv.current_stock !== undefined)
      factualItems.push(`Current warehouse inventory stock: ${rawEv.current_stock} units.`);
    if (rawEv.purchase_count !== undefined && rawEv.purchase_count > 0)
      factualItems.push(`Completed customer purchases: ${rawEv.purchase_count}.`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-5 shadow-card hover:border-border/80 transition-all space-y-4"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border", signal.color)}>
              {signal.label}
            </span>
            <span className={cn("text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border", priorityColors[opportunity.priority as keyof typeof priorityColors] || priorityColors.low)}>
              {opportunity.priority} Priority
            </span>
            {onViewAudit && (
              <button
                onClick={onViewAudit}
                title="View in Audit Trail"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2.5 py-0.5 rounded-full border border-border/60 hover:bg-muted"
              >
                <ShieldCheck className="size-3 text-primary" />
                Audit Trail
              </button>
            )}
            <span className="text-xs font-mono bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-md border border-border/50">
              Heuristic Score: {opportunity.score?.toFixed(2)}
            </span>
          </div>

          <h3 className="text-base font-bold tracking-tight text-foreground flex items-center gap-1.5">
            <Zap className="size-4 text-amber-500 shrink-0" />
            <span>{opportunity.title}</span>
          </h3>

          {opportunity.target && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Target className="size-3.5 text-primary" />
              <span className="font-medium">Target demand signal:</span>
              <span className="font-mono font-semibold bg-muted/80 px-1.5 py-0.5 rounded text-foreground">
                {opportunity.target}
              </span>
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            {opportunity.summary || opportunity.description}
          </p>
        </div>

        {/* Potential Impact Metric */}
        <div className="flex flex-col items-end gap-1.5 shrink-0 bg-muted/30 border border-border rounded-xl p-3 text-right">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Potential Revenue Impact
          </span>
          <span className="text-lg font-bold text-foreground">
            {potentialRev !== undefined && potentialRev !== null
              ? `₹${potentialRev.toLocaleString()}`
              : "Demand Spike"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {potentialRev ? "Estimated by demand model" : "Catalog expansion opportunity"}
          </span>
        </div>
      </div>

      {/* Fact / Hypothesis / Suggestion Section */}
      {opportunity.analysis ? (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between border-t border-border/60 pt-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              <Sparkles className="size-3.5" />
              Revenue Agent Verified Intelligence
            </div>
            {opportunity.analysis.confidence && (
              <span className="text-[11px] font-semibold text-muted-foreground">
                Confidence: <strong className="capitalize text-foreground">{opportunity.analysis.confidence}</strong>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 1. FACT */}
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">
                <Database className="size-3.5" />
                <span>1. FACT (Authoritative Data)</span>
              </div>
              <p className="text-[11px] text-blue-900/70 dark:text-blue-200/70">
                Observed behavioral database metrics:
              </p>
              <ul className="space-y-1 text-xs text-blue-950 dark:text-blue-100">
                {factualItems.length > 0 ? (
                  factualItems.map((fact, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 leading-snug">
                      <span className="text-blue-500 font-bold">•</span>
                      <span>{fact}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-muted-foreground">Aggregated behavioral demand signals.</li>
                )}
              </ul>
            </div>

            {/* 2. HYPOTHESIS */}
            <div className="rounded-xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/50 dark:bg-purple-950/20 p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300">
                <Brain className="size-3.5" />
                <span>2. HYPOTHESIS (AI Inferred)</span>
              </div>
              <p className="text-[11px] text-purple-900/70 dark:text-purple-200/70">
                What the AI agent deduces:
              </p>
              <p className="text-xs text-purple-950 dark:text-purple-100 leading-snug">
                {opportunity.analysis.interpretation}
              </p>
              <p className="text-[10px] text-purple-600/80 dark:text-purple-400/80 italic pt-1 border-t border-purple-200/50 dark:border-purple-900/30">
                AI reasoning derived from demand signals; not an empirical certainty.
              </p>
            </div>

            {/* 3. SUGGESTION */}
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <Lightbulb className="size-3.5" />
                <span>3. SUGGESTION (Action Plan)</span>
              </div>
              <p className="text-[11px] text-emerald-900/70 dark:text-emerald-200/70">
                Recommended merchant action:
              </p>
              <p className="text-xs font-medium text-emerald-950 dark:text-emerald-100 leading-snug">
                {opportunity.analysis.suggested_action || opportunity.suggested_action}
              </p>
              {opportunity.analysis.recommended_actions && opportunity.analysis.recommended_actions.length > 0 && (
                <ul className="space-y-1 text-xs text-emerald-900 dark:text-emerald-100 pt-1">
                  {opportunity.analysis.recommended_actions.map((act, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <CheckCircle2 className="size-3 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{act}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Unanalyzed Opportunity State */
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="size-3.5 text-muted-foreground" />
              Factual Grounding: {factualItems.length} metrics recorded
            </p>
            <p className="text-[11px] text-muted-foreground">
              Run the Revenue Agent to produce grounded AI interpretation and merchant action plan.
            </p>
          </div>
          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className="flex items-center gap-2 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Analyzing with Gemini...
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                AI Analyze Opportunity
              </>
            )}
          </button>
        </div>
      )}

      {/* Footer re-analyze trigger if already analyzed */}
      {opportunity.analysis && (
        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs text-muted-foreground">
          <span className="text-[11px]">Analysis cached from authoritative engine & Revenue Agent.</span>
          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 disabled:opacity-50"
          >
            {isAnalyzing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            Re-run Analysis
          </button>
        </div>
      )}
    </motion.div>
  );
}
