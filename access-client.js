(function installAccessClient(global) {
  const request = global.fetch.bind(global);
  let authRequired;
  let sessionToken = '';

  async function serviceRequiresToken() {
    if (!authRequired) {
      authRequired = request('/health')
        .then(response => response.json())
        .then(health => Boolean(health.auth_required))
        .catch(() => false);
    }
    return authRequired;
  }

  global.fetch = async function authenticatedFetch(input, init) {
    const originalRequest = new Request(input, init);
    const url = new URL(originalRequest.url, global.location.href);
    if (url.origin !== global.location.origin || url.pathname === '/health') {
      return request(originalRequest);
    }
    if (!await serviceRequiresToken()) return request(originalRequest);

    let token = sessionToken;
    try { token = global.sessionStorage.getItem('mindscapeAccessToken') || token; } catch {}
    if (!token) token = global.prompt('Enter the Mindscape access token configured by your administrator.');
    if (!token) return new Response(JSON.stringify({ error: 'access_token_required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });

    const headers = new Headers(originalRequest.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await request(new Request(originalRequest, { headers }));
    if (response.status === 401) {
      sessionToken = '';
      try { global.sessionStorage.removeItem('mindscapeAccessToken'); } catch {}
    } else {
      sessionToken = token;
      try { global.sessionStorage.setItem('mindscapeAccessToken', token); } catch {}
    }
    return response;
  };
})(window);
