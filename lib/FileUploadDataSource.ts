import { RemoteGraphQLDataSource } from '@apollo/gateway';
import { GraphQLResponse, GraphQLRequestContext } from 'apollo-server-types';
import { fetch, Request, Headers } from 'apollo-server-env';
import { FileUpload } from 'graphql-upload';
import { isObject } from '@apollo/gateway/dist/utilities/predicates';
import cloneDeep from 'lodash.clonedeep';
import set from 'lodash.set';

import FormData from './FormData';

type FileVariablesTuple = [string, Promise<FileUpload>];

type Variables = object | null;

interface DataSourceArgs {
  request: GraphQLRequestContext['request'];
  context: unknown;
}

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
          if (value instanceof Promise) {
            acc.push([key, value]);
            return acc;
          }
          if (isObject(value)) {
            return extract(value, name);
          }
          return acc;
        },
        [],
      );
    };
    return extract(rootVariables);
  }

  async process(args: DataSourceArgs): Promise<GraphQLResponse> {
    const fileVariables = FileUploadDataSource.extractFileVariables(
      args.request.variables,
    );
    if (fileVariables.length > 0) {
      return this.processFiles(args, fileVariables);
    }
    return super.process(args);
  }

  private async processFiles(
    args: DataSourceArgs,
    fileVariables: FileVariablesTuple[],
  ): Promise<GraphQLResponse> {
    const { request } = args;
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
      body: (form as unknown) as string,
    };

    const httpRequest = new Request(request.http.url, options);

    try {
      const httpResponse = await fetch(httpRequest);

      const body = await this.didReceiveResponse(httpResponse, httpRequest);

      if (!isObject(body)) {
        throw new Error(`Expected JSON response body, but received: ${body}`);
      }
      const response = {
        ...body,
        http: httpResponse,
      };

      return response;
    } catch (error) {
      this.didEncounterError(error, httpRequest);
      throw error;
    }
  }
}
