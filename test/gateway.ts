import { ApolloServer } from 'apollo-server-express';
import { ApolloGateway } from '@apollo/gateway';
import { ApolloServerPluginInlineTraceDisabled } from 'apollo-server-core';
import express from 'express';
import { graphqlUploadExpress } from 'graphql-upload';
import http from 'http';

import FileUploadDataSource from '../lib';

const {
  CHUNKED_DOWNLOAD_SERVICE_PORT = '4002',
  DOWNLOAD_SERVICE_PORT = '4001',
  GATEWAY_PORT = '4000',
} = process.env;

const gateway = async (): Promise<
  [ApolloServer, ApolloGateway, () => Promise<void>]
> => {
  const apolloGateway = new ApolloGateway({
    buildService: ({ url }): FileUploadDataSource =>
      new FileUploadDataSource({
        url,
        useChunkedTransfer:
          url?.includes(CHUNKED_DOWNLOAD_SERVICE_PORT) ?? true,
      }),
    serviceList: [
      {
        name: 'chunked-download',
        url: `http://localhost:${CHUNKED_DOWNLOAD_SERVICE_PORT}/graphql`,
      },
      {
        name: 'download',
        url: `http://localhost:${DOWNLOAD_SERVICE_PORT}/graphql`,
      },
    ],
  });
  const app = express();
  app.use(graphqlUploadExpress());
  const server = new ApolloServer({
    gateway: apolloGateway,
    plugins: [ApolloServerPluginInlineTraceDisabled()],
  });
  await server.start();
  server.applyMiddleware({ app, path: '/' });

  const expressServer = await new Promise<http.Server>(resolve => {
    const s = app.listen(parseInt(GATEWAY_PORT, 10), 'localhost', () =>
      resolve(s),
    );
  });
  // eslint-disable-next-line no-console
  console.log(`🚀  Server ready at http://localhost:${GATEWAY_PORT}`);
  return [
    server,
    apolloGateway,
    async (): Promise<void> => {
      await server.stop();
      expressServer.close();
    },
  ];
};

export default gateway;
