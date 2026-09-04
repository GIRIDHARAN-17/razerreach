export interface User {
  id: string;
  firebase_uid?: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  idToken?: string;
  role?: string;
}

export interface Requirement {
  id: string;
  text: string;
  parsedBrand?: string;
  parsedCategory?: string;
  parsedMaxBudget?: number;
  currency?: string;
  skinType?: string;
}

export interface ProductCandidate {
  id: string;
  name: string;
  price: number | null;
  currency: string;
  merchant: string;
  features: string[];
  brand: string;
  category: string;
  imageUrl?: string | null;
  images?: string[];
}

export interface DecisionResult {
  score: number;
  maxScore: number;
  reasons: string[];
  evidence?: string[];
}

export interface Recommendation {
  id: string;
  product: ProductCandidate;
  decision: DecisionResult;
  rank: number;
  failedConstraints?: string[];
}

export interface RecommendationSession {
  id: string;
  query: string;
  status: "success" | "multiple_strong_matches" | "no_match" | "clarification_needed" | string;
  requirement: Requirement;
  recommendations: Recommendation[];
  nearMatches?: Recommendation[];
  question?: string | null;
  conversation?: Array<{ role: string; content: string }>;
  createdAt: string;
}

export interface SelectionResult {
  sessionId: string;
  recommendationId: string;
  product: ProductCandidate;
  quantity: number;
}

export type OrderStatus =
  | "pending"
  | "PAYMENT_PENDING"
  | "VERIFICATION_PENDING"
  | "PAYMENT_VERIFIED"
  | "PAID"
  | "PAYMENT_FAILED"
  | "REJECTED"
  | "CANCELLED"
  | "payment_initiated"
  | "completed";

export interface Order {
  id: string;
  selection: SelectionResult;
  status: OrderStatus;
  paymentProvider: string;
  total: number;
  razorpayOrderId?: string;
  razorpayKeyId?: string;
  razorpayPaymentId?: string;
  createdAt: string;
}

export type ResponseMode =
  | "AI"
  | "DETERMINISTIC_FALLBACK"
  | "CLARIFICATION"
  | "ERROR";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  products?: Recommendation[];
  comparisonProducts?: Recommendation[];
  selectedProductId?: string;
  responseMode?: ResponseMode;
  activityStatus?: string;
  actionSummary?: string;
}

export interface AISearchApiResponse {
  session_id?: string;
  message: string;
  intent?: {
    search_text?: string;
    category?: string;
    brand?: string;
    min_price?: number;
    max_price?: number;
    color?: string;
    required_features?: string[];
    sort?: string;
  };
  products?: Array<{
    id: string;
    name: string;
    price: number;
    currency?: string;
    stock?: number;
    category?: string;
    merchant_id?: string;
    merchant_name?: string;
    merchant?: string;
    image_url?: string;
    images?: string[];
    why_recommended?: string[];
    score?: number;
  }>;
  response_mode?: ResponseMode;
}
