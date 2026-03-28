import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/providers/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      /* ── Fonts ────────────────────────────────────────── */
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "SF Mono",
          "Fira Code",
          "monospace",
        ],
      },

      /* ── Colors — AXEL Design System ──────────────────── */
      colors: {
        brand: {
          primary: "#06B6D4",
          "primary-hover": "#0891B2",
          "primary-active": "#0E7490",
          "primary-light": "#CFFAFE",
          "primary-muted": "rgba(6, 182, 212, 0.10)",
          "primary-subtle": "rgba(6, 182, 212, 0.06)",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          secondary: "#F5F5F7",
          tertiary: "#FBFBFD",
          hover: "#F0F0F2",
        },
        text: {
          primary: "#1D1D1F",
          secondary: "#6E6E73",
          tertiary: "#86868B",
          "on-brand": "#FFFFFF",
        },
        border: {
          DEFAULT: "#D2D2D7",
          subtle: "#E8E8ED",
          light: "#F5F5F7",
        },
        semantic: {
          success: "#34C759",
          "success-light": "#D1FAE5",
          "success-muted": "rgba(52, 199, 89, 0.10)",
          warning: "#FF9F0A",
          "warning-light": "#FFF4E0",
          "warning-muted": "rgba(255, 159, 10, 0.10)",
          error: "#FF3B30",
          "error-light": "#FEE2E2",
          "error-muted": "rgba(255, 59, 48, 0.10)",
          info: "#007AFF",
          "info-light": "#DBEAFE",
          "info-muted": "rgba(0, 122, 255, 0.10)",
        },
      },

      /* ── Typography sizes (Apple scale) ───────────────── */
      fontSize: {
        "display-lg": ["56px", { lineHeight: "1.07", letterSpacing: "-0.005em", fontWeight: "700" }],
        "display-md": ["48px", { lineHeight: "1.08", letterSpacing: "-0.003em", fontWeight: "700" }],
        "display-sm": ["40px", { lineHeight: "1.1", letterSpacing: "-0.002em", fontWeight: "600" }],
        headline: ["28px", { lineHeight: "1.14", letterSpacing: "0.007em", fontWeight: "600" }],
        "title-1": ["24px", { lineHeight: "1.17", letterSpacing: "0.009em", fontWeight: "600" }],
        "title-2": ["21px", { lineHeight: "1.19", letterSpacing: "0.011em", fontWeight: "600" }],
        "title-3": ["19px", { lineHeight: "1.21", letterSpacing: "0.012em", fontWeight: "600" }],
        body: ["17px", { lineHeight: "1.47", letterSpacing: "-0.022em", fontWeight: "400" }],
        "body-em": ["17px", { lineHeight: "1.47", letterSpacing: "-0.022em", fontWeight: "600" }],
        callout: ["16px", { lineHeight: "1.38", letterSpacing: "-0.016em", fontWeight: "400" }],
        subheadline: ["15px", { lineHeight: "1.33", letterSpacing: "-0.009em", fontWeight: "400" }],
        footnote: ["13px", { lineHeight: "1.38", letterSpacing: "-0.006em", fontWeight: "400" }],
        "caption-1": ["12px", { lineHeight: "1.33", letterSpacing: "0", fontWeight: "400" }],
        "caption-2": ["11px", { lineHeight: "1.27", letterSpacing: "0.006em", fontWeight: "500" }],
      },

      /* ── Border Radius ────────────────────────────────── */
      borderRadius: {
        pill: "980px",
        card: "18px",
        "card-sm": "12px",
        input: "12px",
        modal: "22px",
        toast: "14px",
      },

      /* ── Shadows (light theme) ────────────────────────── */
      boxShadow: {
        xs: "0 1px 2px rgba(0,0,0,0.04)",
        sm: "0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)",
        md: "0 4px 16px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)",
        lg: "0 8px 30px rgba(0,0,0,0.08)",
        xl: "0 16px 48px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.04)",
      },

      /* ── Spacing ──────────────────────────────────────── */
      maxWidth: {
        page: "980px",
        "page-wide": "1200px",
        modal: "480px",
      },

      /* ── Transitions ──────────────────────────────────── */
      transitionDuration: {
        fast: "150ms",
        normal: "250ms",
        slow: "350ms",
      },

      /* ── Z-Index ──────────────────────────────────────── */
      zIndex: {
        dropdown: "50",
        sticky: "100",
        modal: "200",
        toast: "300",
        tooltip: "400",
      },

      /* ── Breakpoints (match design tokens) ────────────── */
      screens: {
        sm: "734px",
        md: "1068px",
        lg: "1440px",
      },

      /* ── Animations ───────────────────────────────────── */
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite linear",
        "fade-in": "fade-in 300ms ease",
        "slide-down": "slide-down 350ms cubic-bezier(0.25, 1, 0.5, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
