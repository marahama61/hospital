// js/auth-fetch.js
// غلاف fetch يضيف Authorization header لو فيه توكن
(function () {
  async function authFetch(input, init = {}) {
    const token = window.TokenUtils.getToken();
    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', 'Bearer ' + token);
    const newInit = Object.assign({}, init, { headers });
    return fetch(input, newInit);
  }

  window.authFetch = authFetch;
})();