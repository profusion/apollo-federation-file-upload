# Apollo Federation file upload

This library makes it easier to support file uploads to your federated
micro-services. It uses the [Apollo](https://www.apollographql.com/docs/apollo-server/data/file-uploads/) server's solution.
It works by simply redirecting the file uploaded stream to the micro-service.
This package does not use third-party services to send the package to your
micro-services.

## Using HTTP Transfer-Encoding: chunked

By default, the `FileUploadDataSource` uses chunked transfers; we
advise that you do not change this setup. However, for some reason
you can't support this kind of transfer, one can provide the `useChunkedTransfer`
option to the `FileUploadDataSource` constructor as `false` to not
use chunked transfer (See the example below on setting this property).
Be advised once again that this can lead to DDOS attacks.

## Example

On your Gateway, you must add the `FileUploadDataSource` in order
to the micro-service be able to receive the uploaded file(s).


```javascript
import { ApolloServer } from 'apollo-server';
import { ApolloGateway } from '@apollo/gateway';
import FileUploadDataSource from '@profusion/apollo-federation-upload';

const runServer = async () => {
  const server = new ApolloServer({
    gateway: new ApolloGateway({
      // Add this line in order to support file uploads.
      buildService: ({ url }) => new FileUploadDataSource({ url, useChunkedTransfer: true }),
      serviceList: [
        /* The services ... */
      ],
    })
  });

  const { url } = await server.listen();

  console.log(`🚀  Server ready at ${url}`);
};

runServer().catch(error => {
  console.error('💥  Failed to start server:', error);
  process.exit(1);
});
```
