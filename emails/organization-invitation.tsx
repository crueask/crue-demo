import { Hr, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailButton } from "./components/email-button";
import { EmailHeader } from "./components/email-header";
import { EmailInfoBox } from "./components/email-info-box";
import { EmailLayout } from "./components/email-layout";

interface OrganizationInvitationEmailProps {
  organizationName: string;
  inviterEmail?: string;
  role: "admin" | "member";
  inviteUrl: string;
}

export const OrganizationInvitationEmail = ({
  organizationName,
  inviterEmail,
  role,
  inviteUrl,
}: OrganizationInvitationEmailProps) => {
  const roleLabel = role === "admin" ? "Administrator" : "Medlem";

  return (
    <EmailLayout preview={`Du er invitert til ${organizationName} på Crue`}>
      <EmailHeader
        title="Du er invitert!"
        subtitle="Bli med i organisasjonen"
        variant="brand"
      />

      <Section style={content}>
        <Text style={greeting}>Hei!</Text>

        <Text style={paragraph}>
          {inviterEmail ? (
            <>
              <span style={highlight}>{inviterEmail}</span> har invitert deg til
              å bli med i <span style={highlight}>{organizationName}</span> på
              Crue.
            </>
          ) : (
            <>
              Du har blitt invitert til å bli med i{" "}
              <span style={highlight}>{organizationName}</span> på Crue.
            </>
          )}
        </Text>

        <Text style={paragraph}>
          Som medlem får du tilgang til organisasjonens prosjekter og data.
        </Text>

        <EmailInfoBox label="Din rolle" value={roleLabel} icon="👥" />

        <Section style={buttonContainer}>
          <EmailButton href={inviteUrl} variant="brand">
            Aksepter invitasjon →
          </EmailButton>
        </Section>

        <Section style={linkSection}>
          <Text style={linkLabel}>Lenke fungerer ikke?</Text>
          <Text style={linkText}>{inviteUrl}</Text>
        </Section>

        <Hr style={divider} />

        <Text style={disclaimer}>
          📅 Denne invitasjonen utløper om <strong>7 dager</strong>
          <br />
          Hvis du ikke forventet denne e-posten, kan du trygt ignorere den.
        </Text>
      </Section>
    </EmailLayout>
  );
};

OrganizationInvitationEmail.PreviewProps = {
  organizationName: "Live Nation Norge",
  inviterEmail: "admin@livenation.no",
  role: "member",
  inviteUrl: "https://crue.no/org-invite/abc123xyz789",
} as OrganizationInvitationEmailProps;

export default OrganizationInvitationEmail;

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

const linkSection = {
  marginTop: "32px",
};

const linkLabel = {
  fontSize: "12px",
  color: "#7d7a75",
  marginBottom: "8px",
  fontFamily: "'SF Mono', 'Menlo', monospace",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  fontWeight: 500,
};

const linkText = {
  fontSize: "13px",
  backgroundColor: "#f8f8f7",
  padding: "12px 16px",
  borderRadius: "8px",
  wordBreak: "break-all" as const,
  color: "#7d7a75",
  fontFamily: "'SF Mono', 'Menlo', monospace",
  border: "1px solid #e9e7e4",
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
