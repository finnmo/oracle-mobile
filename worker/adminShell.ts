/** Serve SPA shell for /admin (no Access JWT injection — password session handles auth). */
export async function serveAdminShell(_request: Request, url: URL, assets: Fetcher): Promise<Response> {
  const assetRes = await assets.fetch(new URL('/index.html', url.origin));
  if (_request.method === 'HEAD') {
    const headers = new Headers(assetRes.headers);
    headers.delete('Location');
    return new Response(null, { status: 200, headers });
  }

  const html = await assetRes.text();
  const headers = new Headers(assetRes.headers);
  headers.delete('Location');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store');

  return new Response(html, { status: 200, statusText: 'OK', headers });
}
