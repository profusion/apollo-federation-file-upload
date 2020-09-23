import genService from './gen-service';

const { CHUNKED_DOWNLOAD_SERVICE_PORT = '4002' } = process.env;

export default genService(CHUNKED_DOWNLOAD_SERVICE_PORT, 'Chunked');
