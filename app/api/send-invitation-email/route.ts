import { NextRequest, NextResponse } from "next/server";
import {
  sendProjectInvitation,
  sendProjectAccessGranted,
  isValidEmail,
} from "@/lib/email/email-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, to, projectName, inviterEmail, role, token, isExistingUser } =
      body;

    // Accept either 'email' or 'to' field
    const recipientEmail = email || to;

    // Validate required fields
    if (!recipientEmail || !projectName) {
      return NextResponse.json(
        { error: "Missing required fields: email and projectName" },
        { status: 400 }
      );
    }

    // Validate email format
    if (!isValidEmail(recipientEmail)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Validate role
    if (role && !["viewer", "editor"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be 'viewer' or 'editor'" },
        { status: 400 }
      );
    }

    // For new users, token is required
    if (!isExistingUser && !token) {
      return NextResponse.json(
        { error: "Token is required for new users" },
        { status: 400 }
      );
    }

    // Send appropriate email based on user status
    let result;
    if (isExistingUser) {
      result = await sendProjectAccessGranted({
        to: recipientEmail,
        projectName,
        inviterEmail,
        role: role || "viewer",
      });
    } else {
      result = await sendProjectInvitation({
        to: recipientEmail,
        projectName,
        inviterEmail,
        role: role || "viewer",
        token,
      });
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("Error in send-invitation-email route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
