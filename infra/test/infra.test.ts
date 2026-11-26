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
    template.resourceCountIs('AWS::DynamoDB::GlobalTable', 1);
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
