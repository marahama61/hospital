// js/login.js
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const submitBtn = document.getElementById("submitBtn");
  const messageEl = document.getElementById("message");
  const authAlert = document.getElementById("authAlert"); // جلب عنصر التنبيه

  const API_URL = "http://smarthospitalapi.somee.com/api/Register/Login";

  // --- التحقق من رسالة انتهاء الجلسة من app-init.js ---
  const authMessage = sessionStorage.getItem("authMessage");
  if (authMessage) {
    authAlert.textContent = authMessage;
    authAlert.style.display = "block";
    // إزالة الرسالة حتى لا تظهر مرة أخرى عند تحديث الصفحة يدوياً
    sessionStorage.removeItem("authMessage");
  }

  function showMessage(text, type = "error") {
    messageEl.textContent = text;
    messageEl.classList.remove("error", "success");
    messageEl.classList.add(type);
  }

  // حاول استخراج الدور من payload التوكن
  function extractRoleFromPayload(payloadObj) {
    if (!payloadObj || typeof payloadObj !== "object") return null;
    if (payloadObj.role) return payloadObj.role;
    if (payloadObj.roles)
      return Array.isArray(payloadObj.roles)
        ? payloadObj.roles[0]
        : payloadObj.roles;
    for (const k of Object.keys(payloadObj)) {
      if (k.toLowerCase().includes("role")) {
        const val = payloadObj[k];
        if (Array.isArray(val)) return val[0];
        return val;
      }
    }
    return null;
  }

  // خريطة التوجيه حسب الدور — عدّل أسماء الملفات حسب مشروعك
  const roleRoutes = {
    Admin: "admin-dashboard.html",
    Doctor: "doctor-dashboard.html",
    Patient: "patient-dashboard.html",
    Pharmacist: "pharmacy-dashboard.html",
    LabTechnician: "labtech-dashboard.html",
    Manager: "manager-dashboard.html",
  };

  async function doLogin(email, password) {
    const body = { email: email, password: password };

    try {
      submitBtn.disabled = true;

      const resp = await fetch(API_URL, {
        method: "POST",
        headers: { Accept: "*/*", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await resp.json().catch(() => null);

      if (!resp.ok) {
        if (data && data.errorMessage) showMessage(data.errorMessage, "error");
        else if (resp.status === 400 || resp.status === 401)
          showMessage("البريد الإلكتروني أو كلمة المرور غير صحيحة", "error");
        else showMessage("حدث خطأ أثناء تسجيل الدخول، حاول مرة أخرى", "error");
        return;
      }

      if (data && data.isAuthSuccessful) {
        // خزّن التوكن والبيانات
        window.TokenUtils.setToken(data.token);
        localStorage.setItem("userId", data.userId || "");
        localStorage.setItem("email", data.email || "");

        // استخرج الدور وخزّنه
        const payload = window.TokenUtils.parseJwt(data.token);
        const role = extractRoleFromPayload(payload) || "Unknown";
        localStorage.setItem("role", role);

        // توجيه فوري للـdashboard المناسب (بدون رسالة للمستخدم)
        const route = roleRoutes[role] || "home.html";
        window.location.href = route;
      } else {
        const err = (data && data.errorMessage) || "بيانات الدخول غير صحيحة";
        showMessage(err, "error");
      }
    } catch (err) {
      console.error("Login error:", err);
      showMessage(
        "حصل خطأ في الاتصال. تأكد من تشغيل السيرفر أو إعدادات الـCORS.",
        "error",
      );
    } finally {
      submitBtn.disabled = false;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    messageEl.textContent = "";

    // إخفاء تنبيه الجلسة عند محاولة تسجيل دخول جديدة لترتيب الواجهة
    authAlert.style.display = "none";

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showMessage("الرجاء ملء البريد الإلكتروني وكلمة المرور.", "error");
      return;
    }

    doLogin(email, password);
  });
});
