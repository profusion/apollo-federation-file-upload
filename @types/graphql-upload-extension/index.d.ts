import 'graphql-upload';

declare module 'graphql-upload' {
  // eslint-disable-next-line import/prefer-default-export
  export class Upload {
    promise: Promise<FileUpload>;
  }
}
