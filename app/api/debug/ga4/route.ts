import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  let ctxAvailable = false;
  let ctxEnv: any = null;
  let ctxError = '';

  try {
    const ctx = getRequestContext();
    ctxAvailable = true;
    const env = ctx.env as Record<string, string | undefined>;
    ctxEnv = {
      GA4_SA_JSON_present: Boolean(env.GA4_SA_JSON),
      GA4_SA_JSON_length: env.GA4_SA_JSON?.length ?? 0,
      GA4_SA_JSON_starts: env.GA4_SA_JSON?.substring(0, 20) ?? '',
      GA4_PROPERTY_ID: env.GA4_PROPERTY_ID,
      all_keys: Object.keys(env).filter(k => !k.includes('SECRET') && !k.includes('TOKEN') && !k.includes('KEY')).slice(0, 30),
    };
  } catch (err) {
    ctxError = (err as Error).message;
  }

  const processEnv = {
    GA4_SA_JSON_present: Boolean(process.env.GA4_SA_JSON),
    GA4_SA_JSON_length: process.env.GA4_SA_JSON?.length ?? 0,
    GA4_PROPERTY_ID: process.env.GA4_PROPERTY_ID,
  };

  return NextResponse.json({
    ctxAvailable,
    ctxError,
    ctxEnv,
    processEnv,
    nodejs_compat: typeof process !== 'undefined',
  });
}
