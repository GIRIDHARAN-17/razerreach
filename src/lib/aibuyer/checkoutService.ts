import { apiClient } from "../api/client";
import type { Order, SelectionResult } from "./types";

export const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export const generateTestModeSignature = async (
  secret: string,
  razorpayOrderId: string,
  razorpayPaymentId: string
): Promise<string> => {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(`${razorpayOrderId}|${razorpayPaymentId}`);

  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureArray = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
    return Array.from(new Uint8Array(signatureArray))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch (e) {
    return "";
  }
};

export const checkoutService = {
  prepareOrder: async (selection: SelectionResult): Promise<Order> => {
    try {
      // Revalidate cart items against live database records
      const preview = await apiClient<any>("/checkout/preview", {
        method: "POST",
      });

      if (preview.merchant_name && selection.product) {
        selection.product.merchant = preview.merchant_name;
      }

      return {
        id: `order-prep-${Date.now()}`,
        selection,
        status: "PAYMENT_PENDING",
        paymentProvider: "Razorpay",
        total: preview.total || selection.product.price! * selection.quantity,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.warn("Checkout preview failed:", error);
      return {
        id: `order-${Date.now()}`,
        selection,
        status: "PAYMENT_PENDING",
        paymentProvider: "Razorpay",
        total: selection.product.price! * selection.quantity,
        createdAt: new Date().toISOString(),
      };
    }
  },

  initiatePayment: async (order: Order): Promise<Order> => {
    try {
      const data = await apiClient<any>("/payments/create", {
        method: "POST",
      });

      return {
        ...order,
        status: "PAYMENT_PENDING",
        razorpayOrderId: data.razorpay_order_id,
        razorpayKeyId: data.razorpay_key_id,
        id: data.order_id || data.id || order.id,
      };
    } catch (error) {
      console.error("Payment initiation failed:", error);
      throw error;
    }
  },

  verifyPayment: async (
    aiOrderId: string,
    razorpayPaymentId: string,
    razorpayOrderId: string,
    razorpaySignature?: string
  ): Promise<boolean> => {
    try {
      const data = await apiClient<any>("/payments/verify", {
        method: "POST",
        data: {
          razorpay_payment_id: razorpayPaymentId,
          razorpay_order_id: razorpayOrderId,
          razorpay_signature: razorpaySignature,
        },
      });

      return data.status === "paid" || data.status === "verified";
    } catch (error) {
      console.error("Payment verification failed:", error);
      return false;
    }
  },
};
