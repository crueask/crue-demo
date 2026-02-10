import { Hr, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailButton } from "./components/email-button";
import { EmailHeader } from "./components/email-header";
import { EmailInfoBox } from "./components/email-info-box";
import { EmailLayout } from "./components/email-layout";

interface OrganizationAccessGrantedEmailProps {
  organizationName: string;
  inviterEmail?: string;
  role: "admin" | "member";
  dashboardUrl: string;
}

export const OrganizationAccessGrantedEmail = ({
  organizationName,
  inviterEmail,
  role,
  dashboardUrl,
}: OrganizationAccessGrantedEmailProps) => {
  const roleLabel = role === "admin" ? "Administrator" : "Medlem";

  return (
    <EmailLayout preview={`Du er lagt til i ${organizationName} på Crue`}>
      <EmailHeader
        title="Velkommen!"
        subtitle="Du er nå medlem av organisasjonen"
        variant="brand"
      />

      <Section style={content}>
        <Text style={greeting}>Hei!</Text>

        <Text style={paragraph}>
          {inviterEmail ? (
            <>
              <span style={highlight}>{inviterEmail}</span> har lagt deg til i{" "}
              <span style={highlight}>{organizationName}</span> på Crue.
            </>
          ) : (
            <>
              Du har blitt lagt til i{" "}
              <span style={highlight}>{organizationName}</span> på Crue.
            </>
          )}
        </Text>

        <Text style={paragraph}>
          Du kan nå se alle prosjekter og data som tilhører organisasjonen.
        </Text>

        <EmailInfoBox label="Din rolle" value={roleLabel} icon="✓" />

        <Section style={buttonContainer}>
          <EmailButton href={dashboardUrl} variant="brand">
            Gå til innstillinger →
          </EmailButton>
        </Section>

        <Hr style={divider} />

        <Text style={disclaimer}>
          Hvis du ikke forventet denne e-posten, kan du trygt ignorere den.
        </Text>
      </Section>
    </EmailLayout>
  );
};

OrganizationAccessGrantedEmail.PreviewProps = {
  organizationName: "Live Nation Norge",
  inviterEmail: "admin@livenation.no",
  role: "admin",
  dashboardUrl: "https://crue.no/dashboard/settings",
} as OrganizationAccessGrantedEmailProps;

export default OrganizationAccessGrantedEmail;

// Premium styles
const content = {
  backgroundColor: "#fffefC",
  padding: "40px",
  border: "1px solid #e9e7e4",
  borderTop: "none",
  borderRadius: "0 0 16px 16px",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.04)",
};

const greeting = {
  fontSize: "20px",
  lineHeight: "1.3",
  marginBottom: "24px",
  color: "#262624",
  fontWeight: 400,
  fontFamily: "'Instrument Serif', Georgia, serif",
  letterSpacing: "-0.01em",
};

const paragraph = {
  fontSize: "16px",
  lineHeight: "1.75",
  marginBottom: "20px",
  color: "#262624",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
};

const highlight = {
  fontWeight: 600,
  color: "#92C7FE",
};

const buttonContainer = {
  textAlign: "center" as const,
  margin: "36px 0",
};

const divider = {
  border: "none",
  borderTop: "1px solid #e9e7e4",
  margin: "32px 0",
};

const disclaimer = {
  fontSize: "12px",
  color: "#94918c",
  margin: 0,
  lineHeight: "1.75",
  fontFamily: "'SF Mono', 'Menlo', monospace",
};
