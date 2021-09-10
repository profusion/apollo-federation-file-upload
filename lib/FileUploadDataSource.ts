import {
  GraphQLDataSourceProcessOptions,
  RemoteGraphQLDataSource,
} from '@apollo/gateway';
import { GraphQLResponse } from 'apollo-server-types';
import { FileUpload, Upload } from 'graphql-upload';
import { Request, Headers, Response } from 'apollo-server-env';
import { isObject } from '@apollo/gateway/dist/utilities/predicates';
import cloneDeep from 'lodash.clonedeep';
import set from 'lodash.set';

import FormData from './FormData';

type FileVariablesTuple = [string, Promise<FileUpload>];

type Variables = Record<string, unknown> | null;

type ConstructorArgs = Exclude<
  ConstructorParameters<typeof RemoteGraphQLDataSource>[0],
  undefined
>;

export type FileUploadDataSourceArgs = ConstructorArgs & {
  useChunkedTransfer?: boolean;
};

type AddDataHandler = (
  form: FormData,
  resolvedFiles: FileUpload[],
) => Promise<void | void[]>;

const addChunkedDataToForm: AddDataHandler = (
  form: FormData,
  resolvedFiles: FileUpload[],
): Promise<void> => {
  resolvedFiles.forEach(
    ({ createReadStream, filename, mimetype: contentType }, i: number) => {
      form.append(i.toString(), createReadStream(), {
        contentType,
        filename,
        /*
          Set knownLength to NaN so node-fetch does not set the
          Content-Length header and properly set the enconding
          to chunked.
          https://github.com/form-data/form-data/pull/397#issuecomment-471976669
        */
        knownLength: Number.NaN,
      });
    },
  );
  return Promise.resolve();
};

const addDataToForm: AddDataHandler = (
  form: FormData,
  resolvedFiles: FileUpload[],
): Promise<void[]> =>
  Promise.all(
    resolvedFiles.map(
      async (
        { createReadStream, filename, mimetype: contentType },
        i: number,
      ): Promise<void> => {
        const fileData = await new Promise<Buffer>((resolve, reject) => {
          const stream = createReadStream();
          const buffers: Buffer[] = [];
          stream.on('error', reject);
          stream.on('data', (data: Buffer) => {
            buffers.push(data);
          });
          stream.on('end', () => {
            resolve(Buffer.concat(buffers));
          });
        });
        form.append(i.toString(), fileData, {
          contentType,
          filename,
          knownLength: fileData.length,
        });
      },
    ),
  );

export default class FileUploadDataSource extends RemoteGraphQLDataSource {
  private static extractFileVariables(
    rootVariables?: Variables,
  ): FileVariablesTuple[] {
    const extract = (
      variables?: Variables,
      prefix?: string,
    ): FileVariablesTuple[] => {
      return Object.entries(variables || {}).reduce(
        (acc: FileVariablesTuple[], [name, value]): FileVariablesTuple[] => {
          const p = prefix ? `${prefix}.` : '';
          const key = `${p}${name}`;
          if (value instanceof Promise || value instanceof Upload) {
            acc.push([
              key,
              value instanceof Upload ? (value as Upload).promise : value,
            ]);
            return acc;
          }
          if (Array.isArray(value)) {
            const [first] = value;
            if (first instanceof Promise || first instanceof Upload) {
              return acc.concat(
                value.map(
                  (
                    v: Promise<FileUpload> | Upload,
                    idx: number,
                  ): FileVariablesTuple => [
                    `${key}.${idx}`,
                    v instanceof Upload ? v.promise : v,
                  ],
                ),
              );
            }
            if (isObject(first)) {
              return acc.concat(
                ...value.map(
                  (v: Variables, idx: number): FileVariablesTuple[] =>
                    extract(v, `${key}.${idx}`),
                ),
              );
            }
            return acc;
          }
          if (isObject(value)) {
            return acc.concat(extract(value as Variables, key));
          }
          return acc;
        },
        [],
      );
    };
    return extract(rootVariables);
  }

  private addDataHandler: AddDataHandler;

  constructor(config?: FileUploadDataSourceArgs) {
    super(config);
    const useChunkedTransfer = config?.useChunkedTransfer ?? true;
    this.addDataHandler = useChunkedTransfer
      ? addChunkedDataToForm
      : addDataToForm;
  }

  async process(
    args: GraphQLDataSourceProcessOptions,
  ): Promise<GraphQLResponse> {
    const fileVariables = FileUploadDataSource.extractFileVariables(
      args.request.variables,
    );
    if (fileVariables.length > 0) {
      return this.processFiles(args, fileVariables);
    }
    return super.process(args);
  }

  private async processFiles(
    args: GraphQLDataSourceProcessOptions,
    fileVariables: FileVariablesTuple[],
  ): Promise<GraphQLResponse> {
    const { context, request } = args;
    const form = new FormData();

    const variables = cloneDeep(request.variables || {});
    fileVariables.forEach(([variableName]: FileVariablesTuple): void => {
      set(variables, variableName, null);
    });

    const operations = JSON.stringify({
      query: request.query,
      variables,
    });

    form.append('operations', operations);

    const fileMap: { [key: string]: string[] } = {};

    const resolvedFiles: FileUpload[] = await Promise.all(
      fileVariables.map(
        async (
          [variableName, file]: FileVariablesTuple,
          i: number,
        ): Promise<FileUpload> => {
          const fileUpload: FileUpload = await file;
          fileMap[i] = [`variables.${variableName}`];
          return fileUpload;
        },
      ),
    );

    // This must come before the file contents append bellow
    form.append('map', JSON.stringify(fileMap));
    await this.addDataHandler(form, resolvedFiles);

    const headers = (request.http && request.http.headers) || new Headers();

    Object.entries(form.getHeaders() || {}).forEach(([k, value]) => {
      headers.set(k, value);
    });

    request.http = {
      headers,
      method: 'POST',
      url: this.url,
    };

    if (this.willSendRequest) {
      await this.willSendRequest(args);
    }

    const options = {
      ...request.http,
      // Apollo types are not up-to-date, make TS happy
      body: form as unknown as string,
    };

    const httpRequest = new Request(request.http.url, options);
    let httpResponse: Response | undefined;

    try {
      httpResponse = await this.fetcher(httpRequest);

      const body = await this.parseBody(httpResponse);

      if (!isObject(body)) {
        throw new Error(`Expected JSON response body, but received: ${body}`);
      }
      const response = {
        ...body,
        http: httpResponse,
      };

      if (typeof this.didReceiveResponse === 'function') {
        return this.didReceiveResponse({ context, request, response });
      }

      return response;
    } catch (error) {
      this.didEncounterError(error as Error, httpRequest, httpResponse);
      throw error;
    }
  }
}
