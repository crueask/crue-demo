import { Section, Text } from "@react-email/components";
import * as React from "react";

interface EmailInfoBoxProps {
  label: string;
  value: string;
  icon?: string;
}

export const EmailInfoBox = ({ label, value, icon }: EmailInfoBoxProps) => {
  return (
    <Section style={infoBox}>
      {icon && <Text style={iconText}>{icon}</Text>}
      <Text style={labelText}>{label}</Text>
      <Text style={valueText}>{value}</Text>
    </Section>
  );
};

const infoBox = {
  backgroundColor: "#fffefC",
  padding: "24px",
  borderRadius: "16px",
  border: "1px solid #e9e7e4",
  marginBottom: "24px",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.04)",
};

const iconText = {
  margin: "0 0 12px 0",
  fontSize: "24px",
  lineHeight: "1",
};

const labelText = {
  margin: "0 0 8px 0",
  fontSize: "11px",
  color: "#94918c",
  lineHeight: "1.5",
  fontFamily: "'SF Mono', 'Menlo', monospace",
  textTransform: "uppercase" as const,
  letterSpacing: "0.1em",
  fontWeight: 500,
};

const valueText = {
  margin: 0,
  fontSize: "18px",
  fontWeight: 600,
  color: "#262624",
  lineHeight: "1.4",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
  letterSpacing: "-0.01em",
};
