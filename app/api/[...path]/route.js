// Every /api/* request is answered by Cairn's API routes (server/server.js) on the Node.js runtime.
import { cairn } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handle = (request) => cairn().handle(request);
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD };
