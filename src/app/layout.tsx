import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Research Claw",
  description: "Read and annotate research papers with Claude.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable}`} suppressHydrationWarning>
      <body>
        {/* Apply saved dark-mode preference before React hydrates to avoid a
            flash of the wrong theme. next/script "beforeInteractive" runs as a
            blocking script in <head> before any hydration. */}
        <Script
          id="dark-mode-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('rc-dark-mode')!=='false')document.documentElement.classList.add('dark')}catch(_){}`,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
