// Pedidos: POST /api/orders e GET /api/orders/{orderId}
const { randomUUID } = require('node:crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  BatchGetCommand,
} = require('@aws-sdk/lib-dynamodb');
const {
  EventBridgeClient,
  PutEventsCommand,
} = require('@aws-sdk/client-eventbridge');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const events = new EventBridgeClient({});
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME;

function reply(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

async function createOrder(rawBody) {
  let body = rawBody;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return reply(400, { error: 'JSON invalido' });
    }
  }

  const customer = body && body.customer;
  const paymentMethod = body && body.paymentMethod;
  const items = body && body.items;
  const ids = Array.isArray(items) ? [...new Set(items.map(Number))] : [];

  if (!customer || !customer.name || !customer.email || !paymentMethod || ids.length === 0) {
    return reply(400, { error: 'Dados do pedido incompletos' });
  }
  if (ids.some((id) => !Number.isInteger(id))) {
    return reply(400, { error: 'IDs de produto invalidos' });
  }

  // Preco vem sempre do banco; o cliente envia somente os IDs.
  const result = await ddb.send(
    new BatchGetCommand({
      RequestItems: {
        [PRODUCTS_TABLE]: { Keys: ids.map((id) => ({ id })) },
      },
    }),
  );
  const products = result.Responses?.[PRODUCTS_TABLE] || [];
  if (products.length !== ids.length) {
    return reply(400, { error: 'Um ou mais produtos nao existem' });
  }

  const byId = new Map(products.map((product) => [product.id, product]));
  const orderItems = ids.map((id) => {
    const product = byId.get(id);
    return {
      productId: id,
      title: product.title,
      platform: product.platform,
      price: product.discountPrice || product.price,
    };
  });
  const total = orderItems.reduce((sum, item) => sum + item.price, 0);
  const orderId = randomUUID();
  const now = new Date().toISOString();

  await ddb.send(
    new PutCommand({
      TableName: ORDERS_TABLE,
      Item: {
        orderId,
        status: 'PENDING',
        customer: { name: customer.name, email: customer.email },
        paymentMethod,
        items: orderItems,
        total,
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(orderId)',
    }),
  );

  await events.send(
    new PutEventsCommand({
      Entries: [
        {
          Source: 'cube.orders',
          DetailType: 'OrderCreated',
          Detail: JSON.stringify({ orderId }),
          EventBusName: EVENT_BUS_NAME,
        },
      ],
    }),
  );

  return reply(201, { orderId, status: 'PENDING' });
}

async function getOrder(orderId) {
  const result = await ddb.send(
    new GetCommand({ TableName: ORDERS_TABLE, Key: { orderId } }),
  );
  if (!result.Item) {
    return reply(404, { error: 'Pedido nao encontrado' });
  }
  return reply(200, result.Item);
}

exports.handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod || '';
  const path = event.rawPath || event.path || '';

  try {
    if (method === 'POST' && /^\/api\/orders\/?$/.test(path)) {
      return await createOrder(event.body);
    }

    if (method === 'GET') {
      const byId = path.match(/^\/api\/orders\/([^/]+)\/?$/);
      if (byId) {
        return await getOrder(decodeURIComponent(byId[1]));
      }
    }

    return reply(404, { error: 'Rota nao encontrada' });
  } catch (error) {
    console.error('Erro em orders:', error);
    return reply(500, { error: 'Erro interno' });
  }
};
