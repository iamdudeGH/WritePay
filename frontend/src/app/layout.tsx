import "./globals.css";
import type { Metadata } from "next";
import { AptosWalletProvider } from "@/components/AptosWalletProvider";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "WritePay | Read, Write, Earn Instantly",
  description: "A decentralized publishing platform using Shelby and Aptos",
};

// Add the Material Symbols stylesheet link
const MaterialSymbols = () => (
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
);


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <MaterialSymbols />
      </head>
      <body className="bg-[#050A15] text-slate-300 font-sans antialiased min-h-screen selection:bg-blue-500/30 selection:text-white pb-20 overflow-y-scroll">
        <AptosWalletProvider>
          <Header />

          <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] opacity-20 pointer-events-none -translate-y-1/2" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.5) 0%, rgba(0,0,0,0) 70%)' }}></div>
            {children}
          </main>
        </AptosWalletProvider>
      </body>
    </html>
  );
}
