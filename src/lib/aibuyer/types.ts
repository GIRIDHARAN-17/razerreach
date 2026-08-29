export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface Requirement {
  id: string;
  text: string;
  parsedBrand?: string;
  parsedCategory?: string;
  parsedMaxBudget?: number;
  currency?: string;
}

export interface ProductCandidate {
  id: string;
  name: string;
  price: number;
  currency: string;
  merchant: string;
  features: string[];
  brand: string;
  category: string;
}

export interface DecisionResult {
  score: number;
  maxScore: number;
  reasons: string[];
}

export interface Recommendation {
  id: string;
  product: ProductCandidate;
  decision: DecisionResult;
  rank: number;
}

export interface RecommendationSession {
  id: string;
  query: string;
  requirement: Requirement;
  recommendations: Recommendation[];
  createdAt: string;
}

export interface SelectionResult {
  sessionId: string;
  recommendationId: string;
  product: ProductCandidate;
  quantity: number;
}

export type OrderStatus = "pending" | "payment_initiated" | "completed" | "cancelled";

export interface Order {
  id: string;
  selection: SelectionResult;
  status: OrderStatus;
  paymentProvider: string;
  total: number;
  createdAt: string;
}
