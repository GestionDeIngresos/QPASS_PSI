import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { OcultarEnPanel } from "@/components/OcultarEnPanel";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "QPass",
  description: "La plataforma definitiva de accesos y administración de eventos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={poppins.variable}>
      <body className="flex min-h-screen flex-col font-sans">
        <OcultarEnPanel>
          <Header />
        </OcultarEnPanel>
        <main className="flex-1">{children}</main>
        <OcultarEnPanel>
          <Footer />
        </OcultarEnPanel>
      </body>
    </html>
  );
}