import { ApolloServer, gql } from 'apollo-server';
import { buildFederatedSchema } from '@apollo/federation';
import { FileUpload } from 'graphql-upload';
import { GraphQLResolverMap } from 'apollo-graphql';

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
): (() => Promise<ApolloServer>) => {
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
  };
  return async (): Promise<ApolloServer> => {
    const server = new ApolloServer({
      schema: buildFederatedSchema([
        {
          resolvers,
          typeDefs,
        },
      ]),
      subscriptions: false,
    });

    const { url } = await server.listen({ port });
    // eslint-disable-next-line no-console
    console.log(`🚀  Server ready at ${url}`);
    return server;
  };
};

export default genService;
