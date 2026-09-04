import { apiClient } from "../api/client";
import { sessionService } from "./sessionService";
import type {
  Requirement,
  RecommendationSession,
  Recommendation,
  ResponseMode,
  AISearchApiResponse,
} from "./types";

export interface SearchTurnResult {
  sessionId: string;
  message: string;
  responseMode: ResponseMode;
  recommendations: Recommendation[];
  requirement?: Requirement;
  status: "success" | "clarification_needed" | "no_match" | "fallback" | "error";
  question?: string | null;
}

export const searchService = {
  /**
   * Send chat query to the stateful Buyer Agent (/api/ai/search).
   * Passes session_id and captures backend response_mode and grounded products.
   */
  sendChatMessage: async (
    query: string,
    existingSessionId?: string
  ): Promise<SearchTurnResult> => {
    const sessionIdToSend = existingSessionId || sessionService.getSessionId() || undefined;

    const requestData: Record<string, any> = {
      message: query.trim(),
    };
    if (sessionIdToSend) {
      requestData.session_id = sessionIdToSend;
    }

    try {
      const data = await apiClient<AISearchApiResponse>("/ai/search", {
        method: "POST",
        data: requestData,
      });

      const backendSessionId = data.session_id || sessionIdToSend || `sess-${Date.now()}`;
      sessionService.setSessionId(backendSessionId);

      const responseMode = data.response_mode || "AI";
      const intent = data.intent || {};

      const requirement: Requirement = {
        id: `req-${Date.now()}`,
        text: query,
        parsedBrand: intent.brand,
        parsedCategory: intent.category,
        parsedMaxBudget: intent.max_price,
        currency: "INR",
      };

      const recommendations: Recommendation[] = (data.products || []).map(
        (rec: any, index: number) => ({
          id: rec.id || `rec-${index}`,
          product: {
            id: rec.id || `cand-${index}`,
            name: rec.name || "Product",
            price: rec.price !== undefined ? Number(rec.price) : null,
            currency: rec.currency || "INR",
            merchant: rec.merchant_name || rec.merchant || "RazorReach Store",
            features: rec.why_recommended || [],
            brand: intent.brand || "Catalog",
            category: rec.category || intent.category || "",
            imageUrl: rec.image_url || (rec.images && rec.images[0]) || null,
            images: rec.images || (rec.image_url ? [rec.image_url] : []),
          },
          decision: {
            score: rec.score || (10 - index),
            maxScore: 10,
            reasons: rec.why_recommended || ["Matched search criteria"],
            evidence: [],
          },
          rank: index + 1,
        })
      );

      let turnStatus: "success" | "clarification_needed" | "no_match" | "fallback" | "error" = "success";
      if (responseMode === "CLARIFICATION") {
        turnStatus = "clarification_needed";
      } else if (recommendations.length === 0) {
        turnStatus = "no_match";
      } else if (responseMode === "DETERMINISTIC_FALLBACK") {
        turnStatus = "fallback";
      }

      return {
        sessionId: backendSessionId,
        message: data.message || "Here are your recommendations.",
        responseMode,
        recommendations,
        requirement,
        status: turnStatus,
        question: responseMode === "CLARIFICATION" ? data.message : null,
      };
    } catch (error: any) {
      console.warn("AI Search API error / fallback triggered:", error);
      const activeSessionId = sessionIdToSend || sessionService.getSessionId() || `sess-${Date.now()}`;

      // Graceful fallback state without exposing raw traces
      return {
        sessionId: activeSessionId,
        message: "I can still help you search our catalog and manage your cart.",
        responseMode: "DETERMINISTIC_FALLBACK",
        recommendations: [],
        status: "fallback",
        question: null,
      };
    }
  },

  /**
   * Backward-compatible submitQuery returning RecommendationSession
   */
  submitQuery: async (
    query: string,
    existingSessionId?: string
  ): Promise<RecommendationSession> => {
    const result = await searchService.sendChatMessage(query, existingSessionId);

    const requirement: Requirement = result.requirement || {
      id: `req-${Date.now()}`,
      text: query,
      currency: "INR",
    };

    const conversation = [
      { role: "user", content: query },
      { role: "assistant", content: result.message },
    ];

    return {
      id: result.sessionId,
      query,
      status: result.status,
      requirement,
      recommendations: result.recommendations,
      question: result.question,
      conversation,
      createdAt: new Date().toISOString(),
    };
  },
};
