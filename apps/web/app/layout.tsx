import "./globals.css";
import { Nunito } from "next/font/google";
import { Providers } from "@/components/layout/Providers";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-nunito",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <title>GoodTrip</title>
      </head>
      <body className="font-sans bg-white text-black">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
