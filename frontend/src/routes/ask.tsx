import { createFileRoute, redirect } from "@tanstack/react-router";
import { authService } from "@/lib/aibuyer/authService";

export const Route = createFileRoute("/ask")({
  beforeLoad: async () => {
    await authService.waitForAuthInit();
    if (!authService.isAuthenticated()) {
      throw redirect({ to: "/auth", replace: true });
    }
    throw redirect({ to: "/app", replace: true });
  },
});
