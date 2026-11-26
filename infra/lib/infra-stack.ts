import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

// Origem do front: GitHub Pages (projeto alisuco/aws-cube-keys).
const GITHUB_PAGES_ORIGIN = 'https://alisuco.github.io';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ----- Catalogo -----
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

    const productsIntegration = new apigwv2integrations.HttpLambdaIntegration(
      'ProductsIntegration',
      productsFn,
      { scopePermissionToRoute: false },
    );

    // O front esta no GitHub Pages: navegador e API estao em origens diferentes.
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: [GITHUB_PAGES_ORIGIN],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST],
        allowHeaders: ['content-type'],
      },
    });
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

    // O seed recebe o catalogo direto do products.json no sintetizador.
    const seedFn = new lambda.Function(this, 'SeedProductsFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambdas', 'seed')),
      timeout: cdk.Duration.seconds(60),
    });
    productsTable.grantWriteData(seedFn);

    const seedProvider = new cr.Provider(this, 'SeedProvider', {
      onEventHandler: seedFn,
    });

    const products = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', '..', 'frontend', 'data', 'products.json'),
        'utf8',
      ),
    ) as Array<Record<string, unknown>>;

    new cdk.CustomResource(this, 'SeedProducts', {
      serviceToken: seedProvider.serviceToken,
      properties: {
        TableName: productsTable.tableName,
        Products: products,
      },
    });

    new cdk.CfnOutput(this, 'ProductsApiUrl', {
      value: `${httpApi.apiEndpoint}/api/products`,
      description: 'URL da API de produtos (copiar para assets/js/config.js)',
    });

    // ----- Pedidos -----
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

    // ----- Processador -----
    const processorFn = new lambda.Function(this, 'ProcessorFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambdas', 'processor')),
      environment: {
        ORDERS_TABLE: ordersTable.tableName,
        SENDER_EMAIL: process.env.CUBE_SENDER_EMAIL ?? '',
      },
      timeout: cdk.Duration.seconds(20),
    });
    ordersTable.grantReadWriteData(processorFn);
    processorFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: ['*'],
      }),
    );

    new events.Rule(this, 'OrderCreatedRule', {
      eventPattern: {
        source: ['cube.orders'],
        detailType: ['OrderCreated'],
      },
      targets: [new targets.LambdaFunction(processorFn, { retryAttempts: 2 })],
    });
  }
}
