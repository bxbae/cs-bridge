"use client";

import { DashboardA } from "@/components/dashboard/DashboardA";
import { DashboardB } from "@/components/dashboard/DashboardB";
import { useTheme } from "@/components/ThemeProvider";

export default function DashboardPage() {
  const { design } = useTheme();
  return design === "b" ? <DashboardB /> : <DashboardA />;
}
