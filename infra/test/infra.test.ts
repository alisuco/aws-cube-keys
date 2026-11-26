import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { InfraStack } from '../lib/infra-stack';

describe('InfraStack — S3 + CloudFront', () => {
  const app = new cdk.App();
  const stack = new InfraStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  test('cria um unico bucket S3 privado', () => {
    template.resourceCountIs('AWS::S3::Bucket', 1);
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('cria OAC e distribuicao com o bucket como origem', () => {
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
        }),
      }),
    });
  });

  test('expõe a URL publica como Output', () => {
    template.hasOutput('CloudFrontUrl', {
      Value: Match.anyValue(),
      Description: 'URL publica da loja Cube Keys',
    });
  });
});

describe('InfraStack — catalogo', () => {
  const app = new cdk.App();
  const stack = new InfraStack(app, 'CatalogTestStack');
  const template = Template.fromStack(stack);

  test('cria a tabela Products com id numerico como chave', () => {
    template.resourceCountIs('AWS::DynamoDB::GlobalTable', 2);
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'N' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    });
  });

  test('registra as duas rotas de leitura do catalogo', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.resourcePropertiesCountIs(
      'AWS::ApiGatewayV2::Route',
      { RouteKey: 'GET /api/products' },
      1,
    );
    template.resourcePropertiesCountIs(
      'AWS::ApiGatewayV2::Route',
      { RouteKey: 'GET /api/products/{id}' },
      1,
    );
  });

  test('semeia a tabela a partir do products.json do S3', () => {
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      BucketName: Match.anyValue(),
      ObjectKey: 'data/products.json',
      TableName: Match.anyValue(),
    });
  });

  test('expõe a URL da API como Output', () => {
    template.hasOutput('ProductsApiUrl', {
      Value: Match.anyValue(),
      Description: 'URL da API de produtos (teste direto ate a Etapa 6)',
    });
  });
});

describe('InfraStack — pedidos', () => {
  const app = new cdk.App();
  const stack = new InfraStack(app, 'OrdersTestStack');
  const template = Template.fromStack(stack);

  test('cria a tabela Orders com orderId como chave', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      AttributeDefinitions: [{ AttributeName: 'orderId', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'orderId', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  test('registra as rotas de criacao e consulta de pedidos', () => {
    template.resourcePropertiesCountIs(
      'AWS::ApiGatewayV2::Route',
      { RouteKey: 'POST /api/orders' },
      1,
    );
    template.resourcePropertiesCountIs(
      'AWS::ApiGatewayV2::Route',
      { RouteKey: 'GET /api/orders/{orderId}' },
      1,
    );
  });

  test('concede permissao para publicar no EventBridge', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'events:PutEvents' }),
        ]),
      }),
    });
  });
});

describe('InfraStack — processador', () => {
  const app = new cdk.App();
  const stack = new InfraStack(app, 'ProcessorTestStack');
  const template = Template.fromStack(stack);

  test('cria regra que filtra OrderCreated', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: {
        source: ['cube.orders'],
        'detail-type': ['OrderCreated'],
      },
    });
  });

  test('concede permissao para enviar e-mail pelo SES', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'ses:SendEmail' }),
        ]),
      }),
    });
  });
});
