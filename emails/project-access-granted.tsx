import { Hr, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailButton } from "./components/email-button";
import { EmailHeader } from "./components/email-header";
import { EmailInfoBox } from "./components/email-info-box";
import { EmailLayout } from "./components/email-layout";

interface ProjectAccessGrantedEmailProps {
  projectName: string;
  inviterEmail?: string;
  role: "viewer" | "editor";
  dashboardUrl: string;
}

export const ProjectAccessGrantedEmail = ({
  projectName,
  inviterEmail,
  role,
  dashboardUrl,
}: ProjectAccessGrantedEmailProps) => {
  const roleLabel =
    role === "viewer" ? "Lesetilgang (GA)" : "Redigeringstilgang (Premium)";

  return (
    <EmailLayout preview={`Du har fått tilgang til ${projectName} på Crue`}>
      <EmailHeader
        title="Velkommen!"
        subtitle="Du har nå tilgang til prosjektet"
        variant="brand"
      />

      <Section style={content}>
        <Text style={greeting}>Hei!</Text>

        <Text style={paragraph}>
          {inviterEmail ? (
            <>
              <span style={highlight}>{inviterEmail}</span> har gitt deg tilgang
              til <span style={highlight}>{projectName}</span> på Crue.
            </>
          ) : (
            <>
              Du har fått tilgang til{" "}
              <span style={highlight}>{projectName}</span> på Crue.
            </>
          )}
        </Text>

        <Text style={paragraph}>
          Du kan nå se all data, analyser og rapporter for dette prosjektet.
        </Text>

        <EmailInfoBox
          label="Din tilgangsnivå"
          value={roleLabel}
          icon="✓"
        />

        <Section style={buttonContainer}>
          <EmailButton href={dashboardUrl} variant="brand">
            Gå til dashboard →
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

ProjectAccessGrantedEmail.PreviewProps = {
  projectName: "Arctic Monkeys World Tour 2026",
  inviterEmail: "anna@livenation.no",
  role: "editor",
  dashboardUrl: "https://crue.no/dashboard",
} as ProjectAccessGrantedEmailProps;

export default ProjectAccessGrantedEmail;

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
