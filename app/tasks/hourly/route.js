// Embarko's hourly schedule calls this to refresh scores, phone alerts and integrations.
import { cairn } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request) => cairn().handle(request);
