import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'ap-south-1' });

export async function enqueueDeliveryAssignment(payload) {
  const queueUrl = process.env.SQS_DELIVERY_QUEUE_URL;
  if (!queueUrl) {
    console.warn('SQS_DELIVERY_QUEUE_URL is not configured; order requires manual assignment');
    return false;
  }
  await sqs.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload)
  }));
  return true;
}
