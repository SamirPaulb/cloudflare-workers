# Serverless Newsletter & Contact Management System using Cloudflare Workers

A fully modular, serverless newsletter and contact form management system built on Cloudflare Workers with multiple email provider support.

## 🚀 Features

- **Multiple Email Providers**: Support for Gmail SMTP (via worker-mailer), MailerLite API, and Cloudflare Email Routing
- **Universal Feed Parser**: Supports RSS 2.0, RSS 1.0, Atom, RDF, and JSON Feed formats
- **Newsletter Management**: Automated feed monitoring and batch email delivery
- **Bot Protection**: Cloudflare Turnstile integration for all forms
- **KV Storage**: Efficient data persistence with Cloudflare KV
- **Automated Backups**: Weekly CSV backups to GitHub
- **Contact Forms**: Integrated contact system with auto-subscribe option
- **Rate Limiting**: Built-in protection against abuse
- **Self-Maintenance**: Automatic weekly cleanup of old data
- **Error Recovery**: Retry logic with exponential backoff and dead letter queue

## 📁 Architecture

```
src/
├── index.js                    # Main entry point
├── config/
│   └── config.js              # Centralized configuration
├── newsletter/
│   ├── frontend/
│   │   ├── subscribe.js       # Subscribe form & handler
│   │   └── unsubscribe.js     # Unsubscribe form & handler
│   └── backend/
│       └── processor.js       # RSS discovery & queue management
├── contact/
│   └── frontend.js            # Contact form & processing
├── email/
│   ├── gmailProvider.js       # Gmail SMTP via worker-mailer
│   ├── mailerLiteProvider.js  # MailerLite API integration
│   ├── workerEmailProvider.js # Cloudflare Email routing
│   └── emailFactory.js        # Email provider factory
├── maintenance/
│   ├── cleanup.js             # Cleanup operations
│   └── backup.js              # GitHub backup functionality
├── middleware/
│   └── protection.js          # Rate limiting & bot protection
├── pages/
│   └── status.js              # Status page generator
└── utils/
    ├── kv.js                  # KV storage utilities
    ├── github.js              # GitHub API utilities
    ├── validation.js          # Input validation
    ├── retry.js               # Retry logic & dead letter queue
    └── feedParser.js          # Universal feed parser
```

## ✅ Demo

### 🏠 Homepage
<img width="1442" height="966" alt="image" src="https://github.com/user-attachments/assets/b699c1a9-97d0-4bf7-b7c1-453ef5ff7099" />

### 🎨 Interactive Forms

#### 💬 Contact Form with Auto-Subscribe
<img width="669" height="807" alt="image" src="https://github.com/user-attachments/assets/6394d3a3-0c7c-4877-a60b-1d1a21ed6ea6" />

#### 📬 Newsletter Subscription Form
<img width="891" height="672" alt="image" src="https://github.com/user-attachments/assets/d6cceedb-140a-4e26-ba6b-5afb85eea928" />

#### 🚫 Unsubscribe Page
<img width="861" height="816" alt="image" src="https://github.com/user-attachments/assets/960d08ce-43eb-419f-8e3c-d98e788ece81" />

#### 📊 System Status Page
> Protected using Cloudflare Zero Trust & Turnstile
<img width="1172" height="874" alt="image" src="https://github.com/user-attachments/assets/42f6ca68-0fae-4edd-a8ed-e04541d78ca8" />
<img width="1553" height="927" alt="image" src="https://github.com/user-attachments/assets/54fd7aa8-7824-4c21-8cae-3f899e21d38a" />
<img width="1130" height="1919" alt="image" src="https://github.com/user-attachments/assets/44a219bf-b167-4108-a27f-0195ea79382b" />


## 🛠️ Setup

### Prerequisites

- Cloudflare account with Workers enabled
- KV namespace created
- GitHub personal access token (for backups)
- Gmail App Password (for Gmail SMTP)
- Cloudflare Turnstile site and secret keys

### Installation

```bash
# Clone the repository
git clone https://github.com/SamirPaulb/newsletter-and-contact-system.git
cd newsletter-and-contact-system

# Install dependencies
npm install
```

### Configuration

Edit `wrangler.toml` to set your non-secret variables:

```toml
[vars]
EMAIL_PROVIDER = "gmail"  # Options: "gmail", "mailerlite", "worker-email"
RSS_FEED_URL = "https://your-site.com/feed.xml"  # Supports RSS, Atom, JSON Feed
GITHUB_OWNER = "your-username"
GITHUB_BACKUP_REPO = "data"
# ... see wrangler.toml for all options
```

### Set Secrets

Configure secrets in the Cloudflare Dashboard under Settings > Variables:

- `GMAIL_USER` - Gmail address for SMTP
- `GMAIL_PASSWORD` - Gmail App Password
- `EMAIL_FROM_ADDRESS` - From email address
- `EMAIL_REPLY_TO` - Reply-to address (optional)
- `GITHUB_TOKEN` - GitHub PAT with repo write access
- `TURNSTILE_SITE_KEY` - Cloudflare Turnstile site key
- `TURNSTILE_SECRET_KEY` - Cloudflare Turnstile secret key

Or use the CLI:

```bash
wrangler secret put GMAIL_USER
wrangler secret put GMAIL_PASSWORD
wrangler secret put GITHUB_TOKEN
wrangler secret put TURNSTILE_SITE_KEY
wrangler secret put TURNSTILE_SECRET_KEY
```

### Deploy

```bash
# Deploy to Cloudflare Workers
wrangler deploy

# Or run locally for development
wrangler dev
```

## 📋 API Endpoints

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Home page with links |
| `GET` | `/subscribe` | Newsletter subscription form |
| `POST` | `/api/subscribe` | Subscribe to newsletter |
| `GET` | `/unsubscribe` | Unsubscribe form |
| `POST` | `/api/unsubscribe` | Unsubscribe from newsletter |
| `GET` | `/contact` | Contact form |
| `POST` | `/api/contact` | Submit contact form |

### Admin Endpoints

**Security:** These endpoints are protected by Cloudflare Turnstile CAPTCHA and can be further secured using Cloudflare Zero Trust access policies.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/check-now` | Manually trigger newsletter processing |
| `POST` | `/maintenance` | Run maintenance tasks (cleanup & backup) |
| `GET` | `/status` | View detailed system status and metrics |
| `GET` | `/debug` | View configuration and environment info |
| `GET` | `/health` | Basic health check endpoint |

#### Securing Admin Endpoints with Cloudflare Zero Trust

To add additional protection to admin endpoints:

1. Go to Cloudflare Zero Trust Dashboard
2. Create an Access Application for your worker domain
3. Set up access policies (e.g., email authentication, IP restrictions)
4. Apply policies to paths: `/check-now`, `/maintenance`, `/status`, `/debug`

This provides an extra layer of authentication beyond Turnstile CAPTCHA.

## 📧 Email Providers

### Gmail (Default)

Uses `worker-mailer` library to send emails via Gmail SMTP.

**Requirements:**
- Gmail account
- App Password (not regular password)
- 2FA enabled

**Limitations:**
- 500 recipients/day (free Gmail)
- 2000 recipients/day (Google Workspace)

### MailerLite (Recommended for Scale)

Uses MailerLite API for professional email delivery.

**Requirements:**
- MailerLite account
- API token from MailerLite dashboard
- Verified sending domain

**Advantages:**
- 12,000 emails/month free tier
- Professional email delivery
- Built-in analytics
- No SMTP limitations

To use, set `EMAIL_PROVIDER = "mailerlite"` in `wrangler.toml`.

### Worker Email (Alternative)

Uses Cloudflare Email Routing.

**Requirements:**
- Custom domain with Cloudflare
- Email routing configured

To use, set `EMAIL_PROVIDER = "worker-email"` in `wrangler.toml`.

## 📰 Supported Feed Formats

The universal feed parser automatically detects and parses:

- **RSS 2.0** - Most common RSS format
- **RSS 1.0/RDF** - Older RSS with RDF namespaces
- **Atom** - Modern XML feed format
- **JSON Feed** - JSON-based feed format

The parser handles:
- CDATA sections
- HTML entities
- Multiple date formats
- Missing fields with fallbacks
- Namespace variations (dc:, content:, etc.)

## ⏰ Cron Schedule

The worker runs on two schedules:

1. **Daily (00:00 UTC)**: Process newsletter queue and discover new posts
2. **Weekly (Saturday 00:00 UTC)**: Run maintenance and backup

## 💾 Data Storage

### KV Prefixes

- `subscriber:` - Newsletter subscribers
- `email-queue:` - Email sending queues
- `newsletter-sent:` - Sent newsletters tracking
- `contact:` - Contact form submissions
- `ratelimit:` - Rate limiting data

### Backup Format

Weekly backups are saved as CSV to your GitHub repository:

```csv
email,type,key,data,timestamp
user@example.com,subscriber,user@example.com,{"subscribedAt":"2024-01-01T00:00:00Z"},2024-01-01T00:00:00Z
```

## 🖼️ Iframe Embedding

Forms support iframe embedding with auto-resize:

```html
<iframe src="https://your-worker.workers.dev/subscribe"
        style="width: 100%; border: none;"></iframe>

<script>
window.addEventListener('message', (e) => {
  if (e.data.type === 'newsletter-iframe-height') {
    document.querySelector('iframe').height = e.data.height;
  }
});
</script>
```

## 🔒 Gmail Setup

1. Enable 2-factor authentication in your Google account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a password for "Mail"
3. Use this App Password as `GMAIL_PASSWORD`

## 📊 Monitoring

Check worker logs in Cloudflare Dashboard:
- Workers & Pages → Your Worker → Logs
- Real-time logging enabled via `wrangler.toml`

## 🐛 Troubleshooting

### Common Issues

1. **"Configuration errors"**: Check `/debug` endpoint for missing configs
2. **Email not sending**: Verify Gmail App Password and credentials
3. **Rate limit hit**: Wait 24 hours or adjust `RATE_LIMIT_MAX`
4. **Turnstile failing**: Verify site and secret keys match

### Debug Endpoints

- `/debug` - Shows configuration status
- `/status` - Shows KV storage statistics
- `/health` - Simple health check

## 🔐 Security

- All forms protected by Cloudflare Turnstile
- Rate limiting on all submissions
- Email validation and disposable domain blocking
- Sanitized inputs to prevent XSS
- Secure token storage in Cloudflare secrets

## 📄 License

[Apache-2.0 License](https://www.apache.org/licenses/LICENSE-2.0)

## 👤 Author

[SamirPaulb](https://github.com/SamirPaulb)

## 🤝 Contributing

Pull requests welcome! Please follow the modular architecture pattern.
