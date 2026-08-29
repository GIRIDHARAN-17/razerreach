import type { Recommendation, SelectionResult } from "./types";

export const selectionService = {
  selectRecommendation: async (
    sessionId: string,
    recommendation: Recommendation,
    quantity = 1
  ): Promise<SelectionResult> => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {
      sessionId,
      recommendationId: recommendation.id,
      product: recommendation.product,
      quantity,
    };
  },
};
