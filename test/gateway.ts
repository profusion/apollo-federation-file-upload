import { ApolloServer } from 'apollo-server';
import { ApolloGateway } from '@apollo/gateway';

import FileUploadDataSource from '../lib';

const { DOWNLOAD_SERVICE_PORT = '4001', GATEWAY_PORT = '4000' } = process.env;

const gateway = async (): Promise<[ApolloServer, ApolloGateway]> => {
  const apolloGateway = new ApolloGateway({
    buildService: ({ url }): FileUploadDataSource =>
      new FileUploadDataSource({ url }),
    serviceList: [
      {
        name: 'download',
        url: `http://localhost:${DOWNLOAD_SERVICE_PORT}/graphql`,
      },
    ],
  });
  const server = new ApolloServer({
    engine: false,
    gateway: apolloGateway,
    subscriptions: false,
  });

  const { url } = await server.listen({ port: GATEWAY_PORT });
  // eslint-disable-next-line no-console
  console.log(`🚀  Server ready at ${url}`);
  return [server, apolloGateway];
};

export default gateway;
