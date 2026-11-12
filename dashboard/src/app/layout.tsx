import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/hooks/useAuth";
import { SidebarProvider } from "@/hooks/useSidebar";
import { ThemeProvider } from "@/hooks/useTheme";

export const metadata: Metadata = {
  title: "CodyNex OS — Autonomous Company Operating System",
  description: "CEO Command Center for CodyNex OS",
  icons: {
    icon: "/codynexos_logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider>
          <AuthProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
