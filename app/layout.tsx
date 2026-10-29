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
  title: "Slothly",
  description: "Catat makan, pantau berat, dan tahu sisa kalori hari ini",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Slothly",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f3e9",
};

// Runs before first paint so the motion choice never flashes. The app has one
// look: light, whatever the phone is set to.
const MOTION_SCRIPT = `(function(){
function read(k){try{return localStorage.getItem(k)}catch(e){return null}}
var motion=matchMedia('(prefers-reduced-motion: reduce)');
function applyMotion(){document.documentElement.dataset.motion=read('mk_motion')==='off'||motion.matches?'off':'auto';}
applyMotion();motion.addEventListener('change',applyMotion);
window.addEventListener('mk-motion',applyMotion);
window.addEventListener('storage',function(e){if(e.key==='mk_motion')applyMotion();});
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${nunito.variable} ${fredoka.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-neutral-50 font-sans text-neutral-900 antialiased">
        <div className="slothly-shell"><main className="slothly-main">{children}</main></div>
        <BottomNav />
      </body>
    </html>
  );
}
