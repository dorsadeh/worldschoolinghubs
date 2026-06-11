import type { Metadata } from "next";
import { Geist, Geist_Mono, Baloo_2, Hanken_Grotesk } from "next/font/google";
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

const balooDisplay = Baloo_2({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const hankenBody = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${balooDisplay.variable} ${hankenBody.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col">
        <FeedbackProvider>
          <div className="min-h-0 flex-1">{children}</div>
          <Footer />
        </FeedbackProvider>
      </body>
    </html>
  );
}
