// Catalogo: GET /api/products e GET /api/products/{id}
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.PRODUCTS_TABLE;

function reply(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const path = event.rawPath || event.path || '';
  const byId = path.match(/^\/api\/products\/([^/]+)\/?$/);

  try {
    if (byId) {
      const id = Number(decodeURIComponent(byId[1]));
      if (!Number.isInteger(id)) {
        return reply(400, { error: 'ID de produto invalido' });
      }
      const result = await ddb.send(
        new GetCommand({ TableName: TABLE_NAME, Key: { id } }),
      );
      if (!result.Item) {
        return reply(404, { error: 'Produto nao encontrado' });
      }
      return reply(200, result.Item);
    }

    if (/^\/api\/products\/?$/.test(path)) {
      const result = await ddb.send(new ScanCommand({ TableName: TABLE_NAME }));
      const items = (result.Items || []).sort((a, b) => a.id - b.id);
      return reply(200, items);
    }

    return reply(404, { error: 'Rota nao encontrada' });
  } catch (error) {
    console.error('Erro ao consultar produtos:', error);
    return reply(500, { error: 'Erro interno' });
  }
};
