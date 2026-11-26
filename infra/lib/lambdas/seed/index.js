// Custom Resource: semea Products a partir do products.json publicado no S3.
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  BatchWriteCommand,
} = require('@aws-sdk/lib-dynamodb');

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: 'cube-keys-products-seed' };
  }

  const { BucketName, ObjectKey, TableName } = event.ResourceProperties;
  const object = await s3.send(
    new GetObjectCommand({ Bucket: BucketName, Key: ObjectKey }),
  );
  const products = JSON.parse(await object.Body.transformToString());

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
