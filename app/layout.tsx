import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { FeedbackProvider } from "@/components/feedback/FeedbackContext";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Worldschool Atlas — directory of worldschooling hubs",
  description: "A browsable directory of worldschooling hubs, pop-ups, communities, and traveling programs for families, with filters by season, cost, and hub type.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col bg-bg text-ink">
        <FeedbackProvider>
          <div className="min-h-0 flex-1">{children}</div>
          <Footer />
        </FeedbackProvider>
      </body>
    </html>
  );
}
