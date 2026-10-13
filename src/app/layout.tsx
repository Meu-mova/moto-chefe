import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MOVA — Gestão de Motos Elétricas",
  description: "MOVA — Sistema multi-loja de gestão de motos elétricas",
  // Declarados aqui para usar nomes próprios: ao declarar `icons`, o Next deixa de gerar as tags
  // de app/icon.* e app/apple-icon.*. O favicon.ico continua pela convenção de arquivo.
  icons: {
    icon: [{ url: "/brand/mova-favicon.svg", type: "image/svg+xml" }],
    apple: "/brand/mova-icone-tela-inicial.png", // tela inicial do iPhone, 180 px
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: o next-themes põe a classe do tema no <html> antes da hidratação.
    <html
      lang="pt-BR"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
