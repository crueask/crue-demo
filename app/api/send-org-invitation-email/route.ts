import { NextRequest, NextResponse } from "next/server";
import {
  sendOrganizationInvitation,
  sendOrganizationAccessGranted,
  isValidEmail,
} from "@/lib/email/email-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, organizationName, inviterEmail, role, token, isExistingUser } =
      body;

    // Validate required fields
    if (!email || !organizationName) {
      return NextResponse.json(
        { error: "Missing required fields: email and organizationName" },
        { status: 400 }
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Validate role
    if (role && !["admin", "member"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be 'admin' or 'member'" },
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
      result = await sendOrganizationAccessGranted({
        to: email,
        organizationName,
        inviterEmail,
        role: role || "member",
      });
    } else {
      result = await sendOrganizationInvitation({
        to: email,
        organizationName,
        inviterEmail,
        role: role || "member",
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
    console.error("Error in send-org-invitation-email route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
