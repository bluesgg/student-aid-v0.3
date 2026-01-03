import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StudentAid - AI-Powered PDF Learning",
  description:
    "Upload your course materials and learn with AI-powered explanations, Q&A, and study outlines.",
  keywords: ["study", "AI", "PDF", "learning", "university", "exam prep"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans h-full antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}





