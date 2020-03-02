# Apollo federation file upload

This library makes it easier to support file uploads to your federated
micro-services. It uses the [Apollo](https://www.apollographql.com/docs/apollo-server/data/file-uploads/) server's solution.
It works by simple redirecting the file uploaded stream to the micro-service.
This package do not use third-party services to send the package to your
micro-services.

## Example

On your Gateway you must add the FileUploadDataSource in order
to the micro-service be able to receive the uploaded file(s).


```javascript
import { ApolloServer } from 'apollo-server';
import { ApolloGateway } from '@apollo/gateway';
import FileUploadDataSource from '@profusion/apollo-federation-upload';

const runServer = async () => {
  const server = new ApolloServer({
    gateway: new ApolloGateway({
      // Add this line in order to support file uploads.
      buildService: ({ url }) => new FileUploadDataSource({ url }),
      serviceList: [
        /* The services ... */
      ],
    }),
    subscriptions: false,
  });

  const { url } = await server.listen();

  console.log(`🚀  Server ready at ${url}`);
};

runServer().catch(error => {
  console.error('💥  Failed to start server:', error);
  process.exit(1);
});
```
