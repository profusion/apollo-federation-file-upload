import { ApolloServer } from 'apollo-server';
import { ApolloGateway } from '@apollo/gateway';
import { ApolloServerPluginInlineTraceDisabled } from 'apollo-server-core';

import FileUploadDataSource from '../lib';

const {
  CHUNKED_DOWNLOAD_SERVICE_PORT = '4002',
  DOWNLOAD_SERVICE_PORT = '4001',
  GATEWAY_PORT = '4000',
} = process.env;

const gateway = async (): Promise<[ApolloServer, ApolloGateway]> => {
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
  const server = new ApolloServer({
    gateway: apolloGateway,
    plugins: [ApolloServerPluginInlineTraceDisabled()],
    subscriptions: false,
  });

  const { url } = await server.listen({ port: GATEWAY_PORT });
  // eslint-disable-next-line no-console
  console.log(`🚀  Server ready at ${url}`);
  return [server, apolloGateway];
};

export default gateway;
