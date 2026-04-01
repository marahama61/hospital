// js/logout.js
(function () {
  function logout() {
    window.TokenUtils.removeToken();
    window.location.href = 'login.html';
  }
  window.AppLogout = { logout };
})();