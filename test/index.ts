/* eslint-disable no-await-in-loop */
import newman, { NewmanRunSummary } from 'newman';

import StartGateway from './gateway';
import StartDownloadService from './download-service';
import StartChunkedDownloadService from './chunked-download-service';

// eslint-disable-next-line import/extensions
import collection from './collection.json';

const maxRetries = 5;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });

const runTests = (gatewayPort: number): Promise<void> =>
  new Promise((resolve, reject) => {
    newman.run(
      {
        collection,
        globals: {
          id: '5bfde907-2a1e-8c5a-2246-4aff74b74236',
          name: 'test-env',
          values: [
            {
              key: 'PORT',
              type: 'text',
              value: gatewayPort,
            },
          ],
        },
        reporters: 'cli',
      },
      (err: Error | null, summary: NewmanRunSummary): void => {
        const finalErr = err || summary.error;
        if (finalErr) {
          reject(finalErr);
          return;
        }
        if (summary.run.failures && summary.run.failures.length > 0) {
          reject(new Error('Postman tests failed'));
          return;
        }
        resolve();
      },
    );
  });

const start = async (): Promise<void> => {
  const chunkedService = await StartChunkedDownloadService();
  const downloadService = await StartDownloadService();
  const gatewayService = await StartGateway({
    chunkedAddress: chunkedService.address,
    downloadAddress: downloadService.address,
  });
  for (let i = 0; i < maxRetries; i += 1) {
    try {
      await sleep(100);
      // wait until the gateway has loaded the service definitions
      await gatewayService.gateway.serviceHealthCheck();
      // eslint-disable-next-line no-empty
    } catch (err) {}
  }
  await runTests(gatewayService.address.port);
  await Promise.all([
    chunkedService.cleanup(),
    downloadService.cleanup(),
    gatewayService.cleanup(),
  ]);
};

start().catch(error => {
  // eslint-disable-next-line no-console
  console.error('💥  Failed to run tests', error);
  process.exit(1);
});
