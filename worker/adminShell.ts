/** Inject Access session JWT into admin HTML so API calls can authenticate. */
export async function serveAdminShell(request: Request, url: URL, assets: Fetcher): Promise<Response> {
  const assetRes = await assets.fetch(new URL('/index.html', url.origin));
  if (request.method === 'HEAD') {
    const headers = new Headers(assetRes.headers);
    headers.delete('Location');
    return new Response(null, { status: 200, headers });
  }

  let html = await assetRes.text();
  const jwt =
    request.headers.get('Cf-Access-Jwt-Assertion') ??
    request.headers.get('cf-access-jwt-assertion');

  if (jwt) {
    const payload = JSON.stringify(jwt);
    const snippet = `<script>try{sessionStorage.setItem('oracle_access_jwt',${payload})}catch(e){}</script>`;
    html = html.includes('</head>') ? html.replace('</head>', `${snippet}</head>`) : snippet + html;
  }

  const headers = new Headers(assetRes.headers);
  headers.delete('Location');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store');

  return new Response(html, { status: 200, statusText: 'OK', headers });
}
