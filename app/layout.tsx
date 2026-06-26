import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from '@vercel/speed-insights/next';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "HNS Service Center — Service Ticket Management",
  description:
    "Manage your computer service requests, warranty claims, upgrades, and PC builds with ease.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..800;1,14..32,300..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: "#fff",
              color: "#1a1a2e",
              borderRadius: "0.75rem",
              border: "1px solid #ddd6cf",
              boxShadow: "0 8px 32px rgba(22,70,157,0.16)",
              fontSize: "0.9375rem",
              padding: "0.75rem 1rem",
            },
            success: {
              iconTheme: { primary: "#16469d", secondary: "#fff" },
            },
            error: {
              iconTheme: { primary: "#cd2426", secondary: "#fff" },
            },
          }}
        />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
