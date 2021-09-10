import 'graphql-upload';

declare module 'graphql-upload' {
  // eslint-disable-next-line import/prefer-default-export
  export interface Upload {
    promise: Promise<FileUpload>;
  }
}
