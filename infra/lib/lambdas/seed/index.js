// Custom Resource: semea Products com o catalogo recebido no template.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  BatchWriteCommand,
} = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: 'cube-keys-products-seed' };
  }

  const { TableName, Products } = event.ResourceProperties;
  // O CloudFormation entrega propriedades de custom resource como string.
  let parsed = Products;
  if (typeof parsed === 'string') {
    parsed = JSON.parse(parsed);
  }
  const products = (Array.isArray(parsed) ? parsed : []).map((product) => ({
    ...product,
    // A tabela Products tem chave numerica; garante o tipo mesmo se vier como texto.
    id: Number(product.id),
  }));
  console.log(
    `Seed: ${products.length} produtos, tipo do primeiro id = ${typeof products[0]?.id}`,
  );

  // BatchWriteItem aceita ate 25 itens por chamada.
  for (let i = 0; i < products.length; i += 25) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TableName]: products
            .slice(i, i + 25)
            .map((product) => ({ PutRequest: { Item: product } })),
        },
      }),
    );
  }

  console.log(`Seed concluido: ${products.length} produtos.`);
  return { PhysicalResourceId: 'cube-keys-products-seed' };
};
