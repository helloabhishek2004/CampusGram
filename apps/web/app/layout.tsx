import type { Metadata, Viewport } from "next";
import "../styles/globals.css";
import { AuthProvider } from "@/components/auth/auth-guard";
import { ThemeProvider } from "@/components/theme/theme-context";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { PortfolioDemoNotice } from "@/components/demo/portfolio-demo-notice";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#101011" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://campusgram.edu"),
  title: {
    default: "CampusGram — Smart Campus Platform",
    template: "%s | CampusGram",
  },
  description:
    "Institutional Smart Campus platform uniting verified campus updates, AI-assisted complaint intelligence, lost & found recovery, academic vaults, and rapid emergency response.",
  applicationName: "CampusGram",
  authors: [{ name: "Smart Campus Operations" }],
  keywords: [
    "Smart Campus",
    "CampusGram",
    "University Portal",
    "Student Information System",
    "Complaint Intelligence",
    "Lost and Found",
    "Emergency Alerts",
    "Academic Notices",
    "Document Vault",
  ],
  creator: "Smart Campus Operations",
  publisher: "Institutional Campus Systems",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://campusgram.edu",
    siteName: "CampusGram Smart Campus",
    title: "CampusGram — Next-Gen Smart Campus Platform",
    description:
      "All-in-one institutional student and faculty platform with AI-driven operations, document vaults, and life-safety systems.",
  },
  twitter: {
    card: "summary_large_image",
    title: "CampusGram — Smart Campus Platform",
    description:
      "All-in-one institutional student and faculty platform with AI-driven operations, document vaults, and life-safety systems.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/assets/campus_gram.ico", sizes: "any" },
      { url: "/assets/campus_gram_icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/assets/campus_gram_icon.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-muted selection:text-foreground transition-colors duration-200">
        <ThemeProvider>
          <AuthProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </AuthProvider>
        </ThemeProvider>
        <PortfolioDemoNotice />
      </body>
    </html>
  );
}
