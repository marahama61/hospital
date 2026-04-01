// js/token-utils.js
// وظائف التعامل مع التوكن مخزّنة على window.TokenUtils
(function () {
  function setToken(token) {
    localStorage.setItem("access_token", token);
  }

  function getToken() {
    return localStorage.getItem("access_token");
  }

  function removeToken() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("email");
  }

  function parseJwt(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad = payload.length % 4;
      if (pad === 2) payload += "==";
      else if (pad === 3) payload += "=";
      else if (pad === 1) payload += "===";
      const binary = atob(payload);
      const json = decodeURIComponent(
        Array.prototype.map
          .call(
            binary,
            (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2),
          )
          .join(""),
      );
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function isTokenExpired(token) {
    if (!token) return true;
    const payload = parseJwt(token);
    if (!payload || !payload.exp) return true;
    const nowSec = Math.floor(Date.now() / 1000);
    return payload.exp <= nowSec;
  }

  function msUntilExpiry(token) {
    const payload = parseJwt(token);
    if (!payload || !payload.exp) return 0;
    const nowMs = Date.now();
    const expMs = payload.exp * 1000;
    return Math.max(0, expMs - nowMs);
  }

  window.TokenUtils = {
    setToken,
    getToken,
    removeToken,
    parseJwt,
    isTokenExpired,
    msUntilExpiry,
  };
})();
