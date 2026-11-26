// Processor: consome OrderCreated, gera chaves, atualiza o pedido e envia SES.
const { randomBytes } = require('node:crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const SENDER_EMAIL = process.env.SENDER_EMAIL || '';

function generateKey() {
  const chunk = () => randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
  return `${chunk()}-${chunk()}-${chunk()}`;
}

exports.handler = async (event) => {
  const orderId = event.detail && event.detail.orderId;
  if (!orderId) {
    console.error('Evento sem orderId:', JSON.stringify(event));
    return;
  }

  const current = await ddb.send(
    new GetCommand({ TableName: ORDERS_TABLE, Key: { orderId } }),
  );
  if (!current.Item) {
    console.error(`Pedido ${orderId} nao encontrado`);
    return;
  }
  if (current.Item.status === 'COMPLETED') {
    console.log(`Pedido ${orderId} ja processado`);
    return;
  }

  const items = (current.Item.items || []).map((item) => ({
    ...item,
    key: generateKey(),
  }));

  // Grava antes do e-mail: se o SES falhar, as chaves ja estao no GET.
  await ddb.send(
    new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: { orderId },
      UpdateExpression:
        'SET #status = :status, #items = :items, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        // "items" e palavra reservada do DynamoDB.
        '#items': 'items',
      },
      ExpressionAttributeValues: {
        ':status': 'COMPLETED',
        ':items': items,
        ':updatedAt': new Date().toISOString(),
      },
    }),
  );

  if (!SENDER_EMAIL) {
    console.log('SENDER_EMAIL vazio: envio de e-mail desativado');
    return;
  }

  const lines = items
    .map((item) => `${item.title} (${item.platform}): ${item.key}`)
    .join('\n');
  try {
    await ses.send(
      new SendEmailCommand({
        Source: SENDER_EMAIL,
        Destination: { ToAddresses: [current.Item.customer.email] },
        Message: {
          Subject: { Data: 'Cube Keys - suas chaves' },
          Body: {
            Text: {
              Data: `Pedido ${orderId}\n\nObrigado pela compra!\n\n${lines}`,
            },
          },
        },
      }),
    );
  } catch (error) {
    // Nao relanca: o pedido ja esta COMPLETED e as chaves estao no GET.
    console.error('Falha ao enviar e-mail:', error);
  }
};
