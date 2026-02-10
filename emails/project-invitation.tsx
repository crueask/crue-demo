import { Hr, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailButton } from "./components/email-button";
import { EmailHeader } from "./components/email-header";
import { EmailInfoBox } from "./components/email-info-box";
import { EmailLayout } from "./components/email-layout";

interface ProjectInvitationEmailProps {
  projectName: string;
  inviterEmail?: string;
  role: "viewer" | "editor";
  inviteUrl: string;
}

export const ProjectInvitationEmail = ({
  projectName,
  inviterEmail,
  role,
  inviteUrl,
}: ProjectInvitationEmailProps) => {
  const roleLabel =
    role === "viewer" ? "Lesetilgang (GA)" : "Redigeringstilgang (Premium)";

  return (
    <EmailLayout preview={`Du er invitert til ${projectName} på Crue`}>
      <EmailHeader
        title="Du er invitert!"
        subtitle="En ny verden av data venter på deg"
        variant="brand"
      />

      <Section style={content}>
        <Text style={greeting}>Hei!</Text>

        <Text style={paragraph}>
          {inviterEmail ? (
            <>
              <span style={highlight}>{inviterEmail}</span> har invitert deg til
              å få tilgang til <span style={highlight}>{projectName}</span> på
              Crue.
            </>
          ) : (
            <>
              Du har blitt invitert til å få tilgang til{" "}
              <span style={highlight}>{projectName}</span> på Crue.
            </>
          )}
        </Text>

        <Text style={paragraph}>
          Crue gir deg full oversikt over prosjektets data, analyser og
          rapporter i sanntid.
        </Text>

        <EmailInfoBox
          label="Din tilgangsnivå"
          value={roleLabel}
          icon="🎫"
        />

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

ProjectInvitationEmail.PreviewProps = {
  projectName: "Arctic Monkeys World Tour 2026",
  inviterEmail: "anna@livenation.no",
  role: "viewer",
  inviteUrl: "https://crue.no/invite/abc123xyz789",
} as ProjectInvitationEmailProps;

export default ProjectInvitationEmail;

// Premium styles matching app design
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
  color: "#92C7FE", // Brand blue
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
