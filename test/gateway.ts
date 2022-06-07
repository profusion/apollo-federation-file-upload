import { ApolloServer } from 'apollo-server-express';
import { ApolloGateway, IntrospectAndCompose } from '@apollo/gateway';
import {
  ApolloServerPluginInlineTraceDisabled,
  ApolloServerPluginLandingPageDisabled,
} from 'apollo-server-core';
import express from 'express';

// eslint-disable-next-line import/extensions
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.js';
import http from 'http';
import type { AddressInfo } from 'net';

import FileUploadDataSource from '../lib';
import { ServiceDescription } from './gen-service';

export type GatewayDescription = ServiceDescription & {
  gateway: ApolloGateway;
};

const gateway = async ({
  chunkedAddress,
  downloadAddress,
}: {
  chunkedAddress: AddressInfo;
  downloadAddress: AddressInfo;
}): Promise<GatewayDescription> => {
  const apolloGateway = new ApolloGateway({
    buildService: ({ url }): FileUploadDataSource =>
      new FileUploadDataSource({
        url,
        useChunkedTransfer:
          url?.includes(chunkedAddress.port.toString()) ?? true,
      }),
    supergraphSdl: new IntrospectAndCompose({
      subgraphs: [
        {
          name: 'chunked-download',
          url: `http://${chunkedAddress.address}:${chunkedAddress.port}/graphql`,
        },
        {
          name: 'download',
          url: `http://${downloadAddress.address}:${downloadAddress.port}/graphql`,
        },
      ],
    }),
  });
  const app = express();
  app.use(graphqlUploadExpress());
  const server = new ApolloServer({
    gateway: apolloGateway,
    plugins: [
      ApolloServerPluginInlineTraceDisabled(),
      ApolloServerPluginLandingPageDisabled(),
    ],
  });
  await server.start();
  server.applyMiddleware({ app, path: '/' });

  const expressServer = await new Promise<http.Server>(resolve => {
    const s = app.listen(0, 'localhost', () => resolve(s));
  });
  const address = expressServer.address() as AddressInfo;
  return {
    address,
    cleanup: async (): Promise<void> => {
      await server.stop();
      expressServer.close();
    },
    gateway: apolloGateway,
    server,
  };
};

export default gateway;
