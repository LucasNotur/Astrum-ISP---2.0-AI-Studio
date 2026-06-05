import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { createHash } from 'crypto';

const etagPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onSend', async (request, reply, payload) => {
    const url = (request.url || '').split('?')[0] ?? '';
    const isTargetRoute = url.startsWith('/api/documents/') || 
                          url.startsWith('/api/manuals/') || 
                          url.startsWith('/api/assets/');

    if (request.method !== 'GET' || reply.statusCode !== 200 || !isTargetRoute || !payload) {
      return payload;
    }

    let payloadString = '';
    if (typeof payload === 'string') {
      payloadString = payload;
    } else if (Buffer.isBuffer(payload)) {
      payloadString = payload.toString();
    } else {
      payloadString = JSON.stringify(payload);
    }

    const etag = '"' + createHash('sha256').update(payloadString).digest('hex').slice(0, 16) + '"';
    
    reply.header('ETag', etag);
    reply.header('Cache-Control', 'private, must-revalidate');

    const ifNoneMatch = request.headers['if-none-match'];

    if (ifNoneMatch === etag) {
      reply.code(304);
      return '';
    }

    return payload;
  });
};

export default fp(etagPlugin);
