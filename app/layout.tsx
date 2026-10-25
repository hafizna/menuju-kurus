import type { Metadata, Viewport } from "next";
import { Nunito, Fredoka } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

// Brand typography: Fredoka (round, friendly) for the wordmark, headings and
// big numbers; Nunito (round terminals, very readable) for everything else.
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});

export const metadata: Metadata = {
  title: "menuju kurus",
  description: "Catat makan, pantau berat, dan tahu sisa kalori hari ini",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "menuju kurus",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#059669",
};

// Runs before first paint so the chosen theme never flashes. "auto" follows the
// phone setting and keeps following it if that changes.
const THEME_SCRIPT = `(function(){try{
var mq=matchMedia('(prefers-color-scheme: dark)');
function apply(){var t=localStorage.getItem('mk_theme')||'auto';
var d=t==='dark'||(t==='auto'&&mq.matches);
document.documentElement.classList.toggle('dark',d);
document.documentElement.style.colorScheme=d?'dark':'light';}
apply();mq.addEventListener('change',apply);
window.addEventListener('mk-theme',apply);
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${nunito.variable} ${fredoka.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-neutral-50 font-sans text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <main className="mx-auto max-w-md pb-24">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
