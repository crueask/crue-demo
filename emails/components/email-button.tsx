import { Button } from "@react-email/components";
import * as React from "react";

interface EmailButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: "brand" | "green" | "purple" | "outline";
}

export const EmailButton = ({
  href,
  children,
  variant = "brand",
}: EmailButtonProps) => {
  let variantStyles = {};

  if (variant === "brand") {
    // Crue brand blue
    variantStyles = {
      backgroundColor: "#92C7FE",
      color: "#262624",
      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05), 0 4px 16px rgba(146, 199, 254, 0.3)",
    };
  } else if (variant === "green") {
    variantStyles = {
      backgroundColor: "#10b981",
      color: "#ffffff",
      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05), 0 4px 16px rgba(16, 185, 129, 0.2)",
    };
  } else if (variant === "purple") {
    variantStyles = {
      backgroundColor: "#6366f1",
      color: "#ffffff",
      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05), 0 4px 16px rgba(99, 102, 241, 0.2)",
    };
  } else {
    variantStyles = {
      backgroundColor: "#ffffff",
      color: "#262624",
      border: "1px solid #e9e7e4",
      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
    };
  }

  return (
    <Button
      href={href}
      style={{
        ...buttonStyle,
        ...variantStyles,
      }}
    >
      {children}
    </Button>
  );
};

const buttonStyle = {
  display: "inline-block",
  padding: "16px 32px",
  borderRadius: "12px",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "16px",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
  textAlign: "center" as const,
  lineHeight: "1.5",
  letterSpacing: "-0.01em",
};
