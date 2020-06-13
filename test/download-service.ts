import { ApolloServer, gql } from 'apollo-server';
import { buildFederatedSchema } from '@apollo/federation';
import { FileUpload } from 'graphql-upload';
import { GraphQLResolverMap } from 'apollo-graphql';

const { DOWNLOAD_SERVICE_PORT = '4001' } = process.env;

const typeDefs = gql`
  scalar Upload

  type File {
    content: String!
    encoding: String!
    filename: String!
    mimetype: String!
  }

  input SimpleInput {
    str: String!
    f: Upload!
  }

  input NestedInput {
    str: String!
    nested: SimpleInput!
  }

  input InputWithUploadArray {
    str: String!
    files: [Upload!]!
  }

  extend type Mutation {
    simpleUpload(f: Upload!): File!
    simpleInput(input: SimpleInput!): File!
    nestedInput(input: NestedInput!): File!
    simpleUploadArray(arr: [Upload!]!, arr2: [Int!]!): [File!]!
    inputWithUploadArray(
      input: InputWithUploadArray!
      input2: [NestedInput!]!
    ): [File!]!
  }

  extend type Query {
    dummy: Boolean
  }
`;

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

const resolvers: GraphQLResolverMap<unknown> = {
  Mutation: {
    inputWithUploadArray: (
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
    nestedInput: (
      _: unknown,
      {
        input: {
          nested: { f },
        },
      },
    ): Promise<File> => processUpload(f),
    simpleInput: (_: unknown, { input: { f } }): Promise<File> =>
      processUpload(f),
    simpleUpload: (_: unknown, { f }): Promise<File> => processUpload(f),
    simpleUploadArray: (_: unknown, { arr }): Promise<File[]> =>
      Promise.all(arr.map(processUpload)),
  },
  Query: {
    // This is needed, so the gateway won't complain that a Query is missing
    dummy: (): boolean => true,
  },
};

const downloadService = async (): Promise<ApolloServer> => {
  const server = new ApolloServer({
    schema: buildFederatedSchema([
      {
        resolvers,
        typeDefs,
      },
    ]),
    subscriptions: false,
  });

  const { url } = await server.listen({ port: DOWNLOAD_SERVICE_PORT });
  // eslint-disable-next-line no-console
  console.log(`🚀  Server ready at ${url}`);
  return server;
};

export default downloadService;
