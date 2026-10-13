import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { pool } from '../config/database.js';

const sns = new SNSClient({ region: process.env.AWS_REGION || 'ap-south-1' });

// Publishes a buyer notification (SNS -> notifier Lambda -> SES). Never throws: a failed email must not fail the order flow.
export async function notifyBuyer(orderId, type) {
  const topicArn = process.env.SNS_ORDER_EVENTS_TOPIC_ARN;
  if (!topicArn) return false;
  try {
    const { rows } = await pool.query(
      `SELECT u.email, u.name FROM orders o JOIN users u ON u.id=o.buyer_id WHERE o.id=$1`, [orderId]
    );
    if (!rows.length || !rows[0].email) return false;
    await sns.send(new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify({ type, orderId, buyerEmail: rows[0].email, buyerName: rows[0].name })
    }));
    return true;
  } catch (error) {
    console.error('Could not publish order event:', error.message);
    return false;
  }
}
