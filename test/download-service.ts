import genService from './gen-service';

const { DOWNLOAD_SERVICE_PORT = '4001' } = process.env;

export default genService(DOWNLOAD_SERVICE_PORT);
