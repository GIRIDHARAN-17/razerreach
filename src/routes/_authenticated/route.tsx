import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authService } from "@/lib/aibuyer/authService";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const user = authService.getUser();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: () => <Outlet />,
});