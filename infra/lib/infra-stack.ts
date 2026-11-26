import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as events from 'aws-cdk-lib/aws-events';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // O front é servido somente pelo CloudFront: o bucket fica sempre privado.
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const deployment = new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '..', '..', 'frontend'), {
          // O video explicativo e grande e nao faz parte do site publicado.
          exclude: ['assets/video/**'],
        }),
      ],
      destinationBucket: websiteBucket,
    });

    // OAC é criado automaticamente e recebe permissão de leitura no bucket.
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'URL publica da loja Cube Keys',
    });

    // ----- Etapa 3: catalogo -----
    const productsTable = new dynamodb.TableV2(this, 'ProductsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.NUMBER },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const productsFn = new lambda.Function(this, 'ProductsFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambdas', 'products')),
      environment: { PRODUCTS_TABLE: productsTable.tableName },
      timeout: cdk.Duration.seconds(10),
    });
    productsTable.grantReadData(productsFn);

    // Uma unica permissao de invoke cobre as duas rotas.
    const productsIntegration = new apigwv2integrations.HttpLambdaIntegration(
      'ProductsIntegration',
      productsFn,
      { scopePermissionToRoute: false },
    );

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi');
    httpApi.addRoutes({
      path: '/api/products',
      methods: [apigwv2.HttpMethod.GET],
      integration: productsIntegration,
    });
    httpApi.addRoutes({
      path: '/api/products/{id}',
      methods: [apigwv2.HttpMethod.GET],
      integration: productsIntegration,
    });

    // O seed reaproveita o products.json que o BucketDeployment ja publicou.
    const seedFn = new lambda.Function(this, 'SeedProductsFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambdas', 'seed')),
      timeout: cdk.Duration.seconds(60),
    });
    websiteBucket.grantRead(seedFn);
    productsTable.grantWriteData(seedFn);

    const seedProvider = new cr.Provider(this, 'SeedProvider', {
      onEventHandler: seedFn,
    });

    const seed = new cdk.CustomResource(this, 'SeedProducts', {
      serviceToken: seedProvider.serviceToken,
      properties: {
        BucketName: websiteBucket.bucketName,
        ObjectKey: 'data/products.json',
        TableName: productsTable.tableName,
      },
    });
    seed.node.addDependency(deployment);

    new cdk.CfnOutput(this, 'ProductsApiUrl', {
      value: `${httpApi.apiEndpoint}/api/products`,
      description: 'URL da API de produtos (teste direto ate a Etapa 6)',
    });

    // ----- Etapa 4: pedidos -----
    const ordersTable = new dynamodb.TableV2(this, 'OrdersTable', {
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const ordersFn = new lambda.Function(this, 'OrdersFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambdas', 'orders')),
      environment: {
        ORDERS_TABLE: ordersTable.tableName,
        PRODUCTS_TABLE: productsTable.tableName,
        EVENT_BUS_NAME: 'default',
      },
      timeout: cdk.Duration.seconds(10),
    });
    ordersTable.grantReadWriteData(ordersFn);
    productsTable.grantReadData(ordersFn);

    const eventBus = events.EventBus.fromEventBusName(this, 'DefaultEventBus', 'default');
    eventBus.grantPutEventsTo(ordersFn);

    const ordersIntegration = new apigwv2integrations.HttpLambdaIntegration(
      'OrdersIntegration',
      ordersFn,
      { scopePermissionToRoute: false },
    );
    httpApi.addRoutes({
      path: '/api/orders',
      methods: [apigwv2.HttpMethod.POST],
      integration: ordersIntegration,
    });
    httpApi.addRoutes({
      path: '/api/orders/{orderId}',
      methods: [apigwv2.HttpMethod.GET],
      integration: ordersIntegration,
    });
  }
}
