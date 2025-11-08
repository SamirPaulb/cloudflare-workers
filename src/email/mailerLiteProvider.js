/**
 * MailerLite Email Provider
 * Uses MailerLite API for sending emails
 * API Documentation: https://developers.mailerlite.com/docs/
 */

/**
 * MailerLite email provider class
 */
export class MailerLiteProvider {
  constructor(config, env) {
    this.config = config;
    this.env = env;
    this.apiKey = config.MAILERLITE_API_TOKEN;
    this.baseUrl = config.MAILERLITE_API_URL || 'https://connect.mailerlite.com/api';
    this.fromEmail = config.EMAIL_FROM_ADDRESS || config.MAILERLITE_FROM_EMAIL;
    this.fromName = config.EMAIL_FROM_NAME || 'Newsletter';
    this.rateLimitPerMinute = config.MAILERLITE_RATE_LIMIT || 120;
  }

  /**
   * Send email via MailerLite API
   */
  async sendEmail({ to, subject, html, text, replyTo }) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'MailerLite API token not configured'
        };
      }

      // Ensure 'to' is an array
      const recipients = Array.isArray(to) ? to : [to];

      // Build the email payload for MailerLite
      const payload = {
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        to: recipients.map(email => ({ email })),
        subject: subject,
        html: html,
        text: text || this.stripHtml(html)
      };

      // Add reply-to if provided
      if (replyTo || this.config.EMAIL_REPLY_TO) {
        payload.reply_to = {
          email: replyTo || this.config.EMAIL_REPLY_TO
        };
      }

      // Send via MailerLite API
      const response = await fetch(`${this.baseUrl}/campaigns/instant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Version': new Date().toISOString().split('T')[0]
        },
        body: JSON.stringify(payload)
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '60';
        return {
          success: false,
          error: `Rate limit exceeded. Retry after ${retryAfter} seconds`,
          retryAfter: parseInt(retryAfter)
        };
      }

      // Handle other errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.message || `MailerLite API error: ${response.status}`,
          details: errorData.errors
        };
      }

      const result = await response.json();

      return {
        success: true,
        message: `Email sent successfully to ${recipients.length} recipient(s)`,
        messageId: result.data?.id,
        response: result
      };
    } catch (error) {
      console.error('MailerLite send error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send email via MailerLite'
      };
    }
  }

  /**
   * Send bulk emails with batching
   */
  async sendBulkEmail({ recipients, subject, html, text, replyTo }) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'MailerLite API token not configured',
          totalSent: 0,
          totalFailed: recipients.length
        };
      }

      const results = [];
      let totalSent = 0;
      let totalFailed = 0;

      // MailerLite batch size (adjust based on your needs)
      const batchSize = this.config.MAILERLITE_BATCH_SIZE || 50;

      // Process in batches
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, Math.min(i + batchSize, recipients.length));

        try {
          // Create a batch campaign
          const payload = {
            from: {
              email: this.fromEmail,
              name: this.fromName
            },
            to: batch.map(email => ({ email })),
            subject: subject,
            html: html,
            text: text || this.stripHtml(html)
          };

          // Add reply-to if provided
          if (replyTo || this.config.EMAIL_REPLY_TO) {
            payload.reply_to = {
              email: replyTo || this.config.EMAIL_REPLY_TO
            };
          }

          // Send batch via MailerLite API
          const response = await fetch(`${this.baseUrl}/campaigns/instant`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`,
              'X-Version': new Date().toISOString().split('T')[0]
            },
            body: JSON.stringify(payload)
          });

          // Handle rate limiting
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After') || '60';
            console.warn(`MailerLite rate limit hit. Waiting ${retryAfter} seconds...`);

            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter) * 1000));
            i -= batchSize; // Retry this batch
            continue;
          }

          if (response.ok) {
            const result = await response.json();
            totalSent += batch.length;
            results.push({
              batch: batch.length,
              success: true,
              messageId: result.data?.id
            });
          } else {
            const errorData = await response.json().catch(() => ({}));
            totalFailed += batch.length;
            results.push({
              batch: batch.length,
              success: false,
              error: errorData.message || `API error: ${response.status}`
            });
          }

          // Add delay between batches to avoid rate limiting
          if (i + batchSize < recipients.length) {
            const delayMs = this.config.MAILERLITE_BATCH_DELAY || 1000;
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        } catch (error) {
          console.error(`MailerLite batch error:`, error);
          totalFailed += batch.length;
          results.push({
            batch: batch.length,
            success: false,
            error: error.message
          });
        }
      }

      return {
        success: totalSent > 0,
        message: `Sent to ${totalSent} recipients, ${totalFailed} failed`,
        totalSent,
        totalFailed,
        results
      };
    } catch (error) {
      console.error('MailerLite bulk send error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send bulk email via MailerLite',
        totalSent: 0,
        totalFailed: recipients.length
      };
    }
  }

  /**
   * Strip HTML tags from content
   */
  stripHtml(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .trim();
  }

  /**
   * Create or update a subscriber in MailerLite
   * (Optional: for syncing KV subscribers to MailerLite)
   */
  async syncSubscriber(email, fields = {}) {
    try {
      if (!this.apiKey) {
        return { success: false, error: 'MailerLite API token not configured' };
      }

      const payload = {
        email: email,
        fields: fields,
        groups: this.config.MAILERLITE_GROUP_ID ? [this.config.MAILERLITE_GROUP_ID] : [],
        status: 'active'
      };

      const response = await fetch(`${this.baseUrl}/subscribers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Version': new Date().toISOString().split('T')[0]
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.message || `Failed to sync subscriber: ${response.status}`
        };
      }

      const result = await response.json();
      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      console.error('MailerLite sync subscriber error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove a subscriber from MailerLite
   */
  async removeSubscriber(email) {
    try {
      if (!this.apiKey) {
        return { success: false, error: 'MailerLite API token not configured' };
      }

      // First, get the subscriber ID
      const searchResponse = await fetch(`${this.baseUrl}/subscribers?filter[email]=${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Version': new Date().toISOString().split('T')[0]
        }
      });

      if (!searchResponse.ok) {
        return {
          success: false,
          error: `Failed to find subscriber: ${searchResponse.status}`
        };
      }

      const searchResult = await searchResponse.json();
      if (!searchResult.data || searchResult.data.length === 0) {
        return {
          success: true,
          message: 'Subscriber not found in MailerLite'
        };
      }

      const subscriberId = searchResult.data[0].id;

      // Delete the subscriber
      const deleteResponse = await fetch(`${this.baseUrl}/subscribers/${subscriberId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Version': new Date().toISOString().split('T')[0]
        }
      });

      if (!deleteResponse.ok && deleteResponse.status !== 204) {
        return {
          success: false,
          error: `Failed to delete subscriber: ${deleteResponse.status}`
        };
      }

      return {
        success: true,
        message: 'Subscriber removed from MailerLite'
      };
    } catch (error) {
      console.error('MailerLite remove subscriber error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test the MailerLite connection
   */
  async testConnection() {
    try {
      if (!this.apiKey) {
        return { success: false, error: 'MailerLite API token not configured' };
      }

      const response = await fetch(`${this.baseUrl}/subscribers?limit=1`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Version': new Date().toISOString().split('T')[0]
        }
      });

      if (response.status === 401) {
        return { success: false, error: 'Invalid API token' };
      }

      if (!response.ok) {
        return { success: false, error: `Connection test failed: ${response.status}` };
      }

      return { success: true, message: 'MailerLite connection successful' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}