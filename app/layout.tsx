import type { Metadata } from "next";
import { Montserrat, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/navbar";
import { getToken } from "@/lib/auth-server";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hadynski Inkaso QA Review",
  description:
    "System do transkrypcji i analizy quality assurance nagran rozmow z Daktela.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const token = await getToken();

  return (
    <html lang="en">
      <body
        className={`${montserrat.variable} ${geistMono.variable} antialiased`}
      >
        <Providers initialToken={token}>
          <Navbar />
          <main>{children}</main>
        </Providers>
        <Toaster richColors />
      </body>
    </html>
  );
}
