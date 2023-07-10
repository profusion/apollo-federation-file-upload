# Apollo Federation file upload

This library makes it easier to support file uploads to your federated
micro-services. It uses the [Apollo](https://www.apollographql.com/docs/apollo-server/data/file-uploads/) server's solution.
It works by simply redirecting the file uploaded stream to the micro-service.
This package does not use third-party services to send the package to your
micro-services.

## Apollo Federation V2 Support

Please, use version 4.0.0+. For Federation V1 use 3.0.0 or earlier.

## Using HTTP Transfer-Encoding: chunked

By default, the `FileUploadDataSource` uses chunked transfers; we
advise that you do not change this setup. However, for some reason
you can't support this kind of transfer, one can provide the `useChunkedTransfer`
option to the `FileUploadDataSource` constructor as `false` to not
use chunked transfer (See the example below on setting this property).
Be advised once again that this can lead to DDOS attacks.

## Preventing CSRF attacks

This package uses `graphql-upload`, if you want to prevent a CSRF attack you should keep
the CSRF prevention feature enabled, and configure your upload clients to send a non-empty
`Apollo-Require-Preflight` header.

You can take a look at [Apollo's security guide](https://www.apollographql.com/docs/apollo-server/security/cors/#preventing-cross-site-request-forgery-csrf) for more details.

#### How to enable CRSF Prevention

```javascript
import { ApolloServer } from 'apollo-server';

const runServer = async () => {
  const server = new ApolloServer({
    /*
     If activated it will request by default a header with ['x-apollo-operation-name', 'apollo-require-preflight']

     You can also change the allowed headers by passing them to csrfPrevention.requestHeaders
    */
    csrfPrevention: true,
    ...
  });
...
};

...
```

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
