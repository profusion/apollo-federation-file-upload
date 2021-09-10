import { ApolloServer, gql } from 'apollo-server-express';
import { buildFederatedSchema } from '@apollo/federation';
import {
  FileUpload,
  graphqlUploadExpress,
  GraphQLUpload,
} from 'graphql-upload';
import { GraphQLResolverMap } from 'apollo-graphql';
import { ApolloServerPluginInlineTraceDisabled } from 'apollo-server-core';
import express from 'express';
import http from 'http';

interface File {
  content: string;
  encoding: string;
  filename: string;
  mimetype: string;
}

const processUpload = async (f: Promise<FileUpload>): Promise<File> => {
  const { createReadStream, ...rest } = await f;
  const content = await new Promise<string>((resolve, reject) => {
    const stream = createReadStream();
    const buffers: Buffer[] = [];
    stream.on('data', (data: Buffer) => {
      buffers.push(data);
    });
    stream.on('end', () => {
      resolve(Buffer.concat(buffers).toString('utf-8'));
    });
    stream.on('error', reject);
  });
  return {
    ...rest,
    content,
  };
};

const genService = (
  port: string | number,
  serviceSuffix = '',
): (() => Promise<[ApolloServer, () => Promise<void>]>) => {
  const typeDefs = gql`
    scalar Upload

    type File${serviceSuffix} {
      content: String!
      encoding: String!
      filename: String!
      mimetype: String!
    }

    input SimpleInput${serviceSuffix} {
      str: String!
      f: Upload!
    }

    input NestedInput${serviceSuffix} {
      str: String!
      nested: SimpleInput${serviceSuffix}!
    }

    input InputWithUploadArray${serviceSuffix} {
      str: String!
      files: [Upload!]!
    }

    extend type Mutation {
      simpleUpload${serviceSuffix}(f: Upload!): File${serviceSuffix}!
      simpleInput${serviceSuffix}(input: SimpleInput${serviceSuffix}!): File${serviceSuffix}!
      nestedInput${serviceSuffix}(input: NestedInput${serviceSuffix}!): File${serviceSuffix}!
      simpleUploadArray${serviceSuffix}(arr: [Upload!]!, arr2: [Int!]!): [File${serviceSuffix}!]!
      inputWithUploadArray${serviceSuffix}(
        input: InputWithUploadArray${serviceSuffix}!
        input2: [NestedInput${serviceSuffix}!]!
      ): [File${serviceSuffix}!]!
    }

    extend type Query {
      dummy${serviceSuffix}: Boolean
    }
  `;
  const resolvers: GraphQLResolverMap<unknown> = {
    Mutation: {
      [`inputWithUploadArray${serviceSuffix}`]: (
        _: unknown,
        { input: { files }, input2 },
      ): Promise<File[]> =>
        Promise.all([
          ...files.map(processUpload),
          ...input2.map(
            ({
              nested: { f },
            }: {
              nested: { f: Promise<FileUpload> };
            }): Promise<File> => processUpload(f),
          ),
        ]),
      [`nestedInput${serviceSuffix}`]: (
        _: unknown,
        {
          input: {
            nested: { f },
          },
        },
      ): Promise<File> => processUpload(f),
      [`simpleInput${serviceSuffix}`]: (
        _: unknown,
        { input: { f } },
      ): Promise<File> => processUpload(f),
      [`simpleUpload${serviceSuffix}`]: (_: unknown, { f }): Promise<File> =>
        processUpload(f),
      [`simpleUploadArray${serviceSuffix}`]: (
        _: unknown,
        { arr },
      ): Promise<File[]> => Promise.all(arr.map(processUpload)),
    },
    Query: {
      // This is needed, so the gateway won't complain that a Query is missing
      [`dummy${serviceSuffix}`]: (): boolean => true,
    },
    // GraphQLResolverMap type is weird...
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    Upload: GraphQLUpload,
  };
  return async (): Promise<[ApolloServer, () => Promise<void>]> => {
    const app = express();
    app.use(graphqlUploadExpress());
    const server = new ApolloServer({
      plugins: [ApolloServerPluginInlineTraceDisabled()],
      schema: buildFederatedSchema([
        {
          resolvers,
          typeDefs,
        },
      ]),
    });
    await server.start();
    server.applyMiddleware({ app });

    const expressServer = await new Promise<http.Server>(resolve => {
      const s = app.listen(
        typeof port === 'string' ? parseInt(port, 10) : port,
        'localhost',
        () => resolve(s),
      );
    });
    // eslint-disable-next-line no-console
    console.log(`🚀  Server ready at http://localhost:${port}`);
    return [
      server,
      async (): Promise<void> => {
        await server.stop();
        expressServer.close();
      },
    ];
  };
};

export default genService;
