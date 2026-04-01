// js/app-init.js
// تضمّن هذا الملف في الصفحات المحمية للتحقق من صلاحية التوكن عند التحميل.
(function () {
  function initAuth() {
    const token = window.TokenUtils.getToken();
    const path = location.pathname.toLowerCase();
    // لا نفعل إعادة توجيه لو نحن في صفحات تسجيل/تسجيل الدخول
    const publicPages = ["/login.html", "/register.html", "/index.html"];

    if (!token || window.TokenUtils.isTokenExpired(token)) {
      window.TokenUtils.removeToken();
      if (!publicPages.includes(path)) {
        sessionStorage.setItem(
          "authMessage",
          "انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مجدداً.",
        );
        window.location.href = "login.html";
      }
      return;
    }

    // جدولة خروج تلقائي عند انتهاء التوكن
    const ms = window.TokenUtils.msUntilExpiry(token);
    if (ms > 0) {
      setTimeout(() => {
        window.TokenUtils.removeToken();
        sessionStorage.setItem(
          "authMessage",
          "انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مجدداً.",
        );
        window.location.href = "login.html";
      }, ms + 1000);
    }
  }

  window.AppAuth = { initAuth };
  // يمكنك الاستدعاء تلقائياً عند تحميل الصفحة إذا أردت:
  // document.addEventListener('DOMContentLoaded', initAuth);
})();
