import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, projectName, inviterEmail, role, token } = body;

    if (!email || !projectName || !token) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Skip email sending if no Resend API key
    if (!process.env.RESEND_API_KEY) {
      console.log("RESEND_API_KEY not configured, skipping email");
      return NextResponse.json({
        success: true,
        skipped: true,
        message: "Email skipped - RESEND_API_KEY not configured",
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://crue.no";
    const inviteUrl = `${baseUrl}/invite/${token}`;
    const roleLabel = role === "viewer" ? "Lesetilgang (GA)" : "Redigeringstilgang (Premium)";

    const { data, error } = await resend.emails.send({
      from: "Crue <noreply@crue.no>",
      to: [email],
      subject: `Du er invitert til ${projectName} på Crue`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Du er invitert!</h1>
          </div>

          <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hei,</p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              ${inviterEmail ? `<strong>${inviterEmail}</strong> har` : "Du har blitt"} invitert deg til å se <strong>${projectName}</strong> på Crue.
            </p>

            <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Din tilgangsnivå:</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600;">${roleLabel}</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Aksepter invitasjon
              </a>
            </div>

            <p style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">
              Eller kopier denne lenken:
            </p>
            <p style="font-size: 14px; background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all;">
              ${inviteUrl}
            </p>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

            <p style="font-size: 12px; color: #9ca3af; margin: 0;">
              Denne invitasjonen utløper om 7 dager. Hvis du ikke forventet denne e-posten, kan du ignorere den.
            </p>
          </div>

          <div style="text-align: center; padding: 20px;">
            <p style="font-size: 12px; color: #9ca3af; margin: 0;">
              Sendt fra <a href="https://crue.no" style="color: #6366f1;">Crue</a>
            </p>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: "Failed to send email", details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: data?.id,
    });
  } catch (error) {
    console.error("Error sending invitation email:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
