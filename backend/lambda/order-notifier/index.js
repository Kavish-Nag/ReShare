import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const ses = new SESv2Client({ region: process.env.AWS_REGION || 'ap-south-1' });

const MESSAGES = {
  DELIVERY_ASSIGNED: ['A delivery partner is on the way to collect your order', 'A delivery partner has been assigned to your ReShare order'],
  PICKED_UP: ['Your ReShare order is on its way', 'Your order has been picked up and is heading to you'],
  DELIVERED: ['Your ReShare order was delivered', 'Your order has been delivered. Enjoy, and thanks for helping reduce food waste']
};

// Triggered by the SNS order-events topic.
export const handler = async (event) => {
  for (const record of event.Records || []) {
    const e = JSON.parse(record.Sns.Message);
    const message = MESSAGES[e.type];
    if (!message || !e.buyerEmail) continue;
    try {
      await ses.send(new SendEmailCommand({
        FromEmailAddress: process.env.SES_FROM_ADDRESS,
        Destination: { ToAddresses: [e.buyerEmail] },
        Content: { Simple: {
          Subject: { Data: message[0] },
          Body: { Text: { Data: `Hi ${e.buyerName || 'there'},\n\n${message[1]}.\n\nOrder reference: ${String(e.orderId).slice(0, 8).toUpperCase()}\n\nThe ReShare team` } }
        } }
      }));
    } catch (error) {
      // SES sandbox rejects unverified recipients; retrying cannot help.
      if (error.name === 'MessageRejected') console.warn(`SES rejected ${e.buyerEmail}: ${error.message}`);
      else throw error;
    }
  }
};
