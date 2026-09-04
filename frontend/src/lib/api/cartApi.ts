import { apiClient } from "./client";

export interface CartItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  image_url?: string;
  stock_available?: boolean;
}

export interface CartResponseData {
  id: string;
  items: CartItem[];
  subtotal: number;
  delivery_fee: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
}

export const cartApi = {
  getCart: async (): Promise<CartResponseData> => {
    return apiClient<CartResponseData>("/cart");
  },

  addItem: async (productId: string, quantity: number = 1): Promise<CartResponseData> => {
    return apiClient<CartResponseData>("/cart/items", {
      method: "POST",
      data: { product_id: productId, quantity },
    });
  },

  updateItem: async (productId: string, quantity: number): Promise<CartResponseData> => {
    return apiClient<CartResponseData>(`/cart/items/${productId}`, {
      method: "PUT",
      data: { quantity },
    });
  },

  removeItem: async (productId: string): Promise<CartResponseData> => {
    return apiClient<CartResponseData>(`/cart/items/${productId}`, {
      method: "DELETE",
    });
  },

  clearCart: async (): Promise<CartResponseData> => {
    return apiClient<CartResponseData>("/cart", {
      method: "DELETE",
    });
  },

  previewCheckout: async (): Promise<Record<string, unknown>> => {
    return apiClient<Record<string, unknown>>("/checkout/preview", {
      method: "POST",
    });
  },
};
