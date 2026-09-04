import { apiClient } from "../api/client";
import type { Recommendation, SelectionResult } from "./types";

export const selectionService = {
  selectRecommendation: async (
    sessionId: string,
    recommendation: Recommendation,
    quantity = 1
  ): Promise<SelectionResult> => {
    // Non-destructive selection: records selection without mutating or wiping user cart
    return {
      sessionId,
      recommendationId: recommendation.id,
      product: recommendation.product,
      quantity,
    };
  },
};
