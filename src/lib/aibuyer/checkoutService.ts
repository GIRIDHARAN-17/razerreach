import type { Order, SelectionResult } from "./types";

export const checkoutService = {
  prepareOrder: async (selection: SelectionResult): Promise<Order> => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      id: `order-${Date.now()}`,
      selection,
      status: "pending",
      paymentProvider: "Razorpay Test Mode",
      total: selection.product.price * selection.quantity,
      createdAt: new Date().toISOString(),
    };
  },

  initiatePayment: async (order: Order): Promise<Order> => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { ...order, status: "payment_initiated" };
  },
};
