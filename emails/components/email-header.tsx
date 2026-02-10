import { Heading, Section, Text, Link } from "@react-email/components";
import * as React from "react";

interface EmailHeaderProps {
  title: string;
  subtitle?: string;
  variant?: "brand" | "green" | "purple";
}

export const EmailHeader = ({
  title,
  subtitle,
  variant = "brand",
}: EmailHeaderProps) => {
  let gradientStyles = {};

  if (variant === "brand") {
    // Crue brand gradient: white (top) → pink → blue (bottom)
    gradientStyles = {
      background: "linear-gradient(to bottom, #F5F5F5 0%, #FFE8F8 65%, #92C7FE 100%)",
      boxShadow: "0 4px 24px rgba(146, 199, 254, 0.2)",
    };
  } else if (variant === "green") {
    gradientStyles = {
      background: "linear-gradient(to bottom, #10b981 0%, #059669 100%)",
      boxShadow: "0 4px 24px rgba(16, 185, 129, 0.15)",
    };
  } else {
    gradientStyles = {
      background: "linear-gradient(to bottom, #6366f1 0%, #8b5cf6 100%)",
      boxShadow: "0 4px 24px rgba(99, 102, 241, 0.15)",
    };
  }

  // Use dark text for brand gradient, white for others
  const textColor = variant === "brand" ? "#262624" : "#ffffff";
  const subtitleColor = variant === "brand" ? "rgba(38, 38, 36, 0.7)" : "rgba(255, 255, 255, 0.9)";

  return (
    <Section style={{ ...headerSection, ...gradientStyles }}>
      <Heading style={{ ...heading, color: textColor }}>{title}</Heading>
      {subtitle && <Text style={{ ...subtitleStyle, color: subtitleColor }}>{subtitle}</Text>}
    </Section>
  );
};

const headerSection = {
  padding: "48px 40px",
  borderRadius: "16px 16px 0 0",
  textAlign: "center" as const,
};

const heading = {
  margin: 0,
  fontSize: "32px",
  fontWeight: 400,
  lineHeight: "1.1",
  fontFamily: "'Instrument Serif', 'Georgia', serif",
  letterSpacing: "-0.01em",
};

const subtitleStyle = {
  margin: "8px 0 0 0",
  fontSize: "15px",
  fontWeight: 400,
  lineHeight: "1.5",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
};
