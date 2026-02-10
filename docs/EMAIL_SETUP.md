# Email Setup & Best Practices

This document outlines the email system setup for Crue, including configuration, deliverability, and best practices.

## Overview

Crue uses **React Email** for templating and **Resend** for sending. All emails follow the Crue design system with consistent branding, typography, and colors.

## Architecture

```
User Action → API Route → Email Service → React Email Template → Resend → Recipient
                                ↓
                          Email Tracking & Analytics
```

## Email Templates

All email templates are located in [`/emails`](../emails/) and follow the Crue design system:

- **Layout**: [`emails/components/email-layout.tsx`](../emails/components/email-layout.tsx)
- **Header**: [`emails/components/email-header.tsx`](../emails/components/email-header.tsx)
- **Button**: [`emails/components/email-button.tsx`](../emails/components/email-button.tsx)
- **Info Box**: [`emails/components/email-info-box.tsx`](../emails/components/email-info-box.tsx)

### Available Email Templates

1. **Project Invitation** - For inviting new users to projects
2. **Project Access Granted** - For notifying existing users of new project access
3. **Organization Invitation** - For inviting new users to organizations
4. **Organization Access Granted** - For notifying existing users of new org access

## Design System Integration

All emails use the Crue design system:

### Colors
- **Background**: `rgb(248 248 247)` - Warm neutral light
- **Foreground**: `rgb(38 38 36)` - Near black
- **Green Gradient**: `#10b981` → `#059669` (for existing user notifications)
- **Purple Gradient**: `#6366f1` → `#8b5cf6` (for invitations)

### Typography
- **Sans**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Geist Sans'`
- **Serif**: `'Source Serif 4', Georgia` (for headers)
- **Mono**: `'Geist Mono', 'SF Mono'` (for links/code)

### Border Radius
- Consistent 8px-12px radius matching the app

## Configuration

### Environment Variables

```bash
# Required for sending emails
RESEND_API_KEY=re_xxxxx

# App URL for generating links
NEXT_PUBLIC_APP_URL=https://crue.no
```

### Resend Setup

1. Sign up at [resend.com](https://resend.com)
2. Verify your sending domain
3. Get your API key
4. Add to `.env.local`

## Deliverability Setup

### DNS Authentication (CRITICAL)

**Gmail and Yahoo require authentication**. Without SPF/DKIM/DMARC, your emails will be rejected.

#### 1. SPF Record
Add this TXT record to your DNS:

```
Name: @
Type: TXT
Value: v=spf1 include:amazonses.com include:_spf.resend.com ~all
```

#### 2. DKIM Records
Resend provides these automatically. Go to your Resend domain settings and add the CNAME records.

#### 3. DMARC Record
Add this TXT record:

```
Name: _dmarc
Type: TXT
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@crue.no; pct=100
```

**Test your setup**: Use [mail-tester.com](https://www.mail-tester.com) to verify authentication.

### Best Practices from Email-Best-Practices Skill

✅ **DO:**
- Use transactional emails for system notifications
- Add proper reply-to addresses
- Include unsubscribe options (for marketing emails)
- Tag emails for tracking
- Validate email addresses before sending
- Handle bounces and complaints
- Test emails before production

❌ **DON'T:**
- Send from `@gmail.com` or `@yahoo.com`
- Use misleading subject lines
- Send without authentication
- Ignore bounce rates
- Skip email validation

## Email Service API

The centralized email service is in [`lib/email/email-service.ts`](../lib/email/email-service.ts).

### Sending Project Invitations

```typescript
import { sendProjectInvitation } from "@/lib/email/email-service";

const result = await sendProjectInvitation({
  to: "user@example.com",
  projectName: "Arctic Monkeys Tour 2026",
  inviterEmail: "manager@example.com",
  role: "viewer", // or "editor"
  token: "invitation-token-123",
});

if (result.success) {
  console.log(`Email sent: ${result.messageId}`);
}
```

### Sending Organization Invitations

```typescript
import { sendOrganizationInvitation } from "@/lib/email/email-service";

const result = await sendOrganizationInvitation({
  to: "user@example.com",
  organizationName: "Live Nation Norge",
  inviterEmail: "admin@example.com",
  role: "admin", // or "member"
  token: "invitation-token-456",
});
```

### Batch Sending

```typescript
import { sendEmailBatch, sendProjectInvitation } from "@/lib/email/email-service";

const invitations = [
  { to: "user1@example.com", projectName: "Project A", token: "token1" },
  { to: "user2@example.com", projectName: "Project A", token: "token2" },
];

const results = await sendEmailBatch(
  invitations,
  (invite) => sendProjectInvitation(invite),
  100 // 100ms delay between emails
);
```

## Monitoring & Analytics

### Email Tags

All emails include tags for tracking:
- `category`: Email type (e.g., "project-invitation")
- `project` or `organization`: Entity name

### Resend Dashboard

Monitor email metrics at [resend.com/emails](https://resend.com/emails):
- Delivery rate
- Open rate
- Click rate
- Bounce rate
- Complaint rate

### Webhooks (Future Enhancement)

Set up webhooks to track:
- `email.delivered`
- `email.bounced`
- `email.complained`
- `email.opened`
- `email.clicked`

See `.claude/skills/email-best-practices/resources/webhooks-events.md` for implementation guide.

## Compliance

### CAN-SPAM (US)
✅ Include physical mailing address
✅ Clear subject lines
✅ Honor opt-outs within 10 days
✅ Include unsubscribe link (for marketing emails)

### GDPR (EU)
✅ Get explicit consent
✅ Include data processing info
✅ Allow data deletion requests
✅ Honor opt-outs immediately

### CASL (Canada)
✅ Get express consent
✅ Identify sender clearly
✅ Include unsubscribe mechanism

**Transactional emails** (like invitations) are exempt from most marketing email regulations, but best practices still apply.

## Testing Emails

### Local Development

Preview emails locally:

```bash
npm run email
```

This starts the React Email dev server at `http://localhost:3000`.

### Test Sending

Send test emails to:
- [mail-tester.com](https://www.mail-tester.com)
- [Litmus](https://www.litmus.com) (paid)
- Your own email addresses across different providers

### Email Clients to Test

- Gmail (desktop & mobile)
- Outlook (desktop & mobile)
- Apple Mail (iOS & macOS)
- Yahoo Mail
- ProtonMail

## Troubleshooting

### Emails Going to Spam

1. **Check authentication**: Verify SPF/DKIM/DMARC records
2. **Check sender reputation**: Use [senderscore.org](https://www.senderscore.org)
3. **Review content**: Avoid spam trigger words
4. **Check bounce rate**: Should be < 2%
5. **Warm up domain**: Start with low volume

### High Bounce Rate

1. **Validate emails**: Use `isValidEmail()` helper
2. **Remove invalid addresses**: Clean your list
3. **Check typos**: Common mistakes like `gmial.com`
4. **Verify domain**: Ensure recipient domains exist

### Rate Limiting

Resend limits:
- **Free tier**: 100 emails/day
- **Pro tier**: 50,000 emails/month

Use `sendEmailBatch()` with delays to avoid hitting rate limits.

## Future Enhancements

- [ ] Welcome email sequence
- [ ] Password reset emails
- [ ] Email preferences management
- [ ] Marketing email campaigns
- [ ] Email analytics dashboard
- [ ] A/B testing for subject lines
- [ ] Localization (multiple languages)
- [ ] Dark mode email templates

## Resources

- [React Email Docs](https://react.email)
- [Resend Docs](https://resend.com/docs)
- [Email Best Practices Skill](./.claude/skills/email-best-practices/)
- [CAN-SPAM Compliance](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- [GDPR Email Rules](https://gdpr.eu/email-encryption/)

## Support

For email-related issues:
1. Check Resend dashboard for errors
2. Review `.claude/skills/email-best-practices/` resources
3. Test with mail-tester.com
4. Contact support@resend.com for deliverability issues
