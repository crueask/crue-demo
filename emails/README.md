# Email Templates

Professional, branded email templates for Crue using React Email.

## Quick Start

### Preview Emails Locally

```bash
npm run email
```

Opens at `http://localhost:3001` - live preview of all email templates.

### Send an Email

```typescript
import { sendProjectInvitation } from "@/lib/email/email-service";

await sendProjectInvitation({
  to: "user@example.com",
  projectName: "Arctic Monkeys Tour 2026",
  inviterEmail: "manager@crue.no",
  role: "viewer",
  token: "invitation-token-123",
});
```

## Available Templates

### 1. Project Invitation
**File**: [`project-invitation.tsx`](./project-invitation.tsx)
**When**: Inviting new users to a project
**Variant**: Purple gradient

### 2. Project Access Granted
**File**: [`project-access-granted.tsx`](./project-access-granted.tsx)
**When**: Notifying existing users they've been added to a project
**Variant**: Green gradient

### 3. Organization Invitation
**File**: [`organization-invitation.tsx`](./organization-invitation.tsx)
**When**: Inviting new users to an organization
**Variant**: Purple gradient

### 4. Organization Access Granted
**File**: [`organization-access-granted.tsx`](./organization-access-granted.tsx)
**When**: Notifying existing users they've been added to an org
**Variant**: Green gradient

## Components

Reusable email components in [`components/`](./components/):

- **EmailLayout** - Outer wrapper with footer
- **EmailHeader** - Gradient header with title
- **EmailButton** - CTA button (green or purple)
- **EmailInfoBox** - Info card with label/value

## Design System

All emails match the Crue app design:

### Colors
- Background: `rgb(248 248 247)` (warm neutral)
- Text: `rgb(38 38 36)` (near black)
- Green: `#10b981` → `#059669` (existing user notifications)
- Purple: `#6366f1` → `#8b5cf6` (invitations)

### Typography
- **Sans**: System font stack (Geist Sans fallback)
- **Serif**: Source Serif 4 (for headers)
- **Mono**: Geist Mono (for links)

### Spacing
- Consistent 20-30px padding
- 8-12px border radius
- 1.6 line height

## Creating New Templates

1. Create a new file in `/emails`
2. Use the layout and components:

```tsx
import { EmailLayout } from "./components/email-layout";
import { EmailHeader } from "./components/email-header";
import { EmailButton } from "./components/email-button";

export const MyEmail = ({ name, url }) => (
  <EmailLayout preview="Preview text here">
    <EmailHeader title="Email Title" variant="green" />
    <Section style={{ padding: "30px" }}>
      <Text>Hello {name}!</Text>
      <EmailButton href={url} variant="green">
        Click Here
      </EmailButton>
    </Section>
  </EmailLayout>
);
```

3. Add preview props:

```tsx
MyEmail.PreviewProps = {
  name: "John Doe",
  url: "https://crue.no",
};
```

4. Add to email service ([`lib/email/email-service.ts`](../lib/email/email-service.ts))

## Testing

### Local Preview
```bash
npm run email
```

### Send Test Email
```bash
# In Node console or API route
const result = await sendProjectInvitation({
  to: "your-email@example.com",
  projectName: "Test Project",
  role: "viewer",
  token: "test-token",
});
```

### Test Deliverability
Send to [mail-tester.com](https://www.mail-tester.com) to check:
- ✅ SPF/DKIM/DMARC authentication
- ✅ Spam score
- ✅ HTML validity
- ✅ Mobile rendering

## Best Practices

### ✅ DO
- Keep emails under 102KB
- Use system fonts
- Include alt text for images
- Test across email clients
- Use semantic HTML
- Inline critical CSS

### ❌ DON'T
- Use custom web fonts
- Rely on JavaScript
- Use `<video>` or `<audio>`
- Use CSS Grid or Flexbox extensively
- Forget mobile testing

## Troubleshooting

### Emails look broken
- Check inline styles (React Email handles this)
- Test in different clients
- Validate HTML

### Emails going to spam
- Verify SPF/DKIM/DMARC records
- Check sender reputation
- Avoid spam trigger words
- See [docs/EMAIL_SETUP.md](../docs/EMAIL_SETUP.md)

### Slow rendering
- Optimize images
- Reduce HTML size
- Minimize inline CSS

## Resources

- [React Email Documentation](https://react.email/docs)
- [Email Client Support](https://www.caniemail.com/)
- [Resend API Docs](https://resend.com/docs)
- [Full Setup Guide](../docs/EMAIL_SETUP.md)
- [Email Best Practices Skill](../.claude/skills/email-best-practices/)
