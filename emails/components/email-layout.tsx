import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
}

export const EmailLayout = ({ preview, children }: EmailLayoutProps) => {
  return (
    <Html>
      <Head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {children}

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Med vennlig hilsen,
              <br />
              Crue-teamet
            </Text>
            <Text style={footerLinks}>
              <a href="https://crue.no" style={footerLink}>
                crue.no
              </a>
              {" · "}
              <a href="mailto:support@crue.no" style={footerLink}>
                Kontakt oss
              </a>
            </Text>
            <Text style={footerDisclaimer}>
              © {new Date().getFullYear()} Crue. Alle rettigheter reservert.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// Premium design system colors - exact match to app
const colors = {
  background: "#f8f8f7",
  foreground: "#262624",
  card: "#fffefC",
  border: "#e9e7e4",
  mutedForeground: "#7d7a75",
  textTertiary: "#94918c",
  accent: "#d2d2ff", // Crue brand purple
  gradientGreen: "#10b981",
  gradientGreenDark: "#059669",
  gradientPurple: "#6366f1",
  gradientPurpleDark: "#8b5cf6",
};

// Typography matching app
const fonts = {
  sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
  serif: "'Source Serif 4', 'Georgia', serif",
  mono: "'SF Mono', 'Menlo', 'Monaco', monospace",
};

const main = {
  backgroundColor: colors.background,
  fontFamily: fonts.sans,
  WebkitFontSmoothing: "antialiased" as const,
  MozOsxFontSmoothing: "grayscale" as const,
};

const container = {
  margin: "0 auto",
  padding: "48px 20px",
  maxWidth: "600px",
};

const footer = {
  textAlign: "center" as const,
  marginTop: "56px",
  paddingTop: "40px",
  borderTop: `1px solid ${colors.border}`,
};

const footerText = {
  fontSize: "13px",
  color: colors.mutedForeground,
  margin: "0 0 20px 0",
  lineHeight: "1.75",
  fontFamily: fonts.mono,
};

const footerLinks = {
  fontSize: "12px",
  color: colors.mutedForeground,
  margin: "0 0 16px 0",
  fontFamily: fonts.mono,
  letterSpacing: "0.02em",
};

const footerLink = {
  color: colors.foreground,
  textDecoration: "none",
  fontWeight: 500,
};

const footerDisclaimer = {
  fontSize: "11px",
  color: colors.textTertiary,
  margin: 0,
  lineHeight: "1.5",
  fontFamily: fonts.mono,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
};
