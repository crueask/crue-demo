import { Resend } from "resend";
import { render } from "@react-email/components";
import * as React from "react";

// Email templates
import { ProjectInvitationEmail } from "@/emails/project-invitation";
import { ProjectAccessGrantedEmail } from "@/emails/project-access-granted";
import { OrganizationInvitationEmail } from "@/emails/organization-invitation";
import { OrganizationAccessGrantedEmail } from "@/emails/organization-access-granted";

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Email configuration
const EMAIL_CONFIG = {
  from: "Crue <noreply@post.crue.no>",
  replyTo: "support@crue.no", // Best practice: provide a reply-to address
  baseUrl: process.env.NEXT_PUBLIC_APP_URL || "https://crue.no",
};

// Email types for type safety
export type EmailType =
  | "project-invitation"
  | "project-access-granted"
  | "organization-invitation"
  | "organization-access-granted";

// Common email result type
export interface EmailResult {
  success: boolean;
  messageId?: string;
  skipped?: boolean;
  error?: string;
}

// Project invitation email
export interface ProjectInvitationData {
  to: string;
  projectName: string;
  inviterEmail?: string;
  role: "viewer" | "editor";
  token: string;
}

export async function sendProjectInvitation(
  data: ProjectInvitationData
): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return {
      success: true,
      skipped: true,
    };
  }

  try {
    const inviteUrl = `${EMAIL_CONFIG.baseUrl}/invite/${data.token}`;

    const emailHtml = await render(
      React.createElement(ProjectInvitationEmail, {
        projectName: data.projectName,
        inviterEmail: data.inviterEmail,
        role: data.role,
        inviteUrl,
      })
    );

    const result = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      replyTo: EMAIL_CONFIG.replyTo,
      to: [data.to],
      subject: `Du er invitert til ${data.projectName} på Crue`,
      html: emailHtml,
      // Best practice: add tags for tracking
      tags: [
        { name: "category", value: "project-invitation" },
        { name: "project", value: data.projectName },
      ],
    });

    if (result.error) {
      console.error("Email send error:", result.error);
      return {
        success: false,
        error: result.error.message,
      };
    }

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error("Failed to send project invitation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Project access granted email
export interface ProjectAccessGrantedData {
  to: string;
  projectName: string;
  inviterEmail?: string;
  role: "viewer" | "editor";
}

export async function sendProjectAccessGranted(
  data: ProjectAccessGrantedData
): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return {
      success: true,
      skipped: true,
    };
  }

  try {
    const dashboardUrl = `${EMAIL_CONFIG.baseUrl}/dashboard`;

    const emailHtml = await render(
      React.createElement(ProjectAccessGrantedEmail, {
        projectName: data.projectName,
        inviterEmail: data.inviterEmail,
        role: data.role,
        dashboardUrl,
      })
    );

    const result = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      replyTo: EMAIL_CONFIG.replyTo,
      to: [data.to],
      subject: `Du har fått tilgang til ${data.projectName} på Crue`,
      html: emailHtml,
      tags: [
        { name: "category", value: "project-access-granted" },
        { name: "project", value: data.projectName },
      ],
    });

    if (result.error) {
      console.error("Email send error:", result.error);
      return {
        success: false,
        error: result.error.message,
      };
    }

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error("Failed to send project access granted:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Organization invitation email
export interface OrganizationInvitationData {
  to: string;
  organizationName: string;
  inviterEmail?: string;
  role: "admin" | "member";
  token: string;
}

export async function sendOrganizationInvitation(
  data: OrganizationInvitationData
): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return {
      success: true,
      skipped: true,
    };
  }

  try {
    const inviteUrl = `${EMAIL_CONFIG.baseUrl}/org-invite/${data.token}`;

    const emailHtml = await render(
      React.createElement(OrganizationInvitationEmail, {
        organizationName: data.organizationName,
        inviterEmail: data.inviterEmail,
        role: data.role,
        inviteUrl,
      })
    );

    const result = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      replyTo: EMAIL_CONFIG.replyTo,
      to: [data.to],
      subject: `Du er invitert til ${data.organizationName} på Crue`,
      html: emailHtml,
      tags: [
        { name: "category", value: "organization-invitation" },
        { name: "organization", value: data.organizationName },
      ],
    });

    if (result.error) {
      console.error("Email send error:", result.error);
      return {
        success: false,
        error: result.error.message,
      };
    }

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error("Failed to send organization invitation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Organization access granted email
export interface OrganizationAccessGrantedData {
  to: string;
  organizationName: string;
  inviterEmail?: string;
  role: "admin" | "member";
}

export async function sendOrganizationAccessGranted(
  data: OrganizationAccessGrantedData
): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return {
      success: true,
      skipped: true,
    };
  }

  try {
    const dashboardUrl = `${EMAIL_CONFIG.baseUrl}/dashboard/settings`;

    const emailHtml = await render(
      React.createElement(OrganizationAccessGrantedEmail, {
        organizationName: data.organizationName,
        inviterEmail: data.inviterEmail,
        role: data.role,
        dashboardUrl,
      })
    );

    const result = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      replyTo: EMAIL_CONFIG.replyTo,
      to: [data.to],
      subject: `Du er lagt til i ${data.organizationName} på Crue`,
      html: emailHtml,
      tags: [
        { name: "category", value: "organization-access-granted" },
        { name: "organization", value: data.organizationName },
      ],
    });

    if (result.error) {
      console.error("Email send error:", result.error);
      return {
        success: false,
        error: result.error.message,
      };
    }

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error("Failed to send organization access granted:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Utility function to validate email addresses
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Utility function for batch sending (with rate limiting)
export async function sendEmailBatch<T>(
  items: T[],
  sendFunction: (item: T) => Promise<EmailResult>,
  delayMs: number = 100
): Promise<EmailResult[]> {
  const results: EmailResult[] = [];

  for (const item of items) {
    const result = await sendFunction(item);
    results.push(result);

    // Rate limiting: small delay between emails
    if (delayMs > 0 && items.indexOf(item) < items.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
