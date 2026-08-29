import type {
  Requirement,
  RecommendationSession,
  Recommendation,
  ProductCandidate,
  DecisionResult,
} from "./types";

const MOCK_PRODUCTS: ProductCandidate[] = [
  {
    id: "samsung-buds2-pro",
    name: "Samsung Galaxy Buds2 Pro Wireless Earbuds",
    price: 17999,
    currency: "₹",
    merchant: "Amazon",
    features: ["Wireless", "Noise Cancellation", "Samsung"],
    brand: "Samsung",
    category: "Headphones",
  },
  {
    id: "samsung-buds-fe",
    name: "Samsung Galaxy Buds FE True Wireless Earbuds",
    price: 19999,
    currency: "₹",
    merchant: "Samsung",
    features: ["Wireless", "Noise Cancellation", "Samsung"],
    brand: "Samsung",
    category: "Headphones",
  },
];

function parseRequirement(query: string): Requirement {
  const normalized = query.toLowerCase();
  const brand = normalized.includes("samsung") ? "Samsung" : undefined;
  const category = normalized.includes("headphones") || normalized.includes("earbuds") ? "Headphones" : undefined;
  const budgetMatch = normalized.match(/under\s*[₹$]?\s*(\d[\d,]*)/);
  const parsedMaxBudget = budgetMatch ? Number(budgetMatch[1].replace(/,/g, "")) : undefined;
  return {
    id: `req-${Date.now()}`,
    text: query,
    parsedBrand: brand,
    parsedCategory: category,
    parsedMaxBudget,
    currency: "₹",
  };
}

function evaluateDecision(product: ProductCandidate, requirement: Requirement): DecisionResult {
  const reasons: string[] = [];
  if (requirement.parsedBrand && product.brand.toLowerCase() === requirement.parsedBrand.toLowerCase()) {
    reasons.push(`${product.brand} brand matched`);
  }
  if (requirement.parsedCategory) {
    reasons.push(requirement.parsedCategory);
  }
  if (requirement.parsedMaxBudget && product.price <= requirement.parsedMaxBudget) {
    reasons.push(`Within ${requirement.currency}${requirement.parsedMaxBudget.toLocaleString()} budget`);
  }
  if (product.features.some((f) => f.toLowerCase().includes("noise cancellation"))) {
    reasons.push("Noise cancellation");
  }

  const score = product.id === "samsung-buds2-pro" ? 7.61 : 7.58;
  return { score, maxScore: 10, reasons };
}

export const searchService = {
  submitQuery: async (query: string): Promise<RecommendationSession> => {
    await new Promise((resolve) => setTimeout(resolve, 2200));
    const requirement = parseRequirement(query);
    const recommendations: Recommendation[] = MOCK_PRODUCTS.map((product, index) => ({
      id: `rec-${product.id}`,
      product,
      decision: evaluateDecision(product, requirement),
      rank: index + 1,
    }));

    return {
      id: `session-${Date.now()}`,
      query,
      requirement,
      recommendations,
      createdAt: new Date().toISOString(),
    };
  },
};
