// js/forgot-password.js
document.addEventListener("DOMContentLoaded", () => {
  const API = "http://smarthospitalapi.somee.com/api/Register/ForgotPassword";

  const form = document.getElementById("forgotForm");
  const emailInput = document.getElementById("email");
  const submitBtn = document.getElementById("submitBtn");
  const messageEl = document.getElementById("message");
  const emailError = document.getElementById("emailError");

  function showMessage(text, type = "error") {
    messageEl.textContent = text;
    messageEl.className =
      "message " + (type === "success" ? "success" : "error");
    messageEl.style.display = "block";
  }

  function hideMessage() {
    messageEl.style.display = "none";
    messageEl.textContent = "";
  }

  function validateEmail(email) {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideMessage();
    emailError.style.display = "none";

    const email = emailInput.value.trim();
    if (!validateEmail(email)) {
      emailError.style.display = "block";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "جاري الإرسال...";

    const payload = { email: email };

    try {
      const resp = await fetch(API, {
        method: "POST",
        headers: {
          Accept: "*/*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      // حاول نقرأ JSON إن وجد
      let data = null;
      try {
        data = await resp.json();
      } catch (e) {
        /* لا شيء */
      }

      if (resp.ok) {
        // رسالة مُحايدة حفاظاً على الخصوصية (لا تكشف وجود المستخدم)
        showMessage(
          "إذا كان هذا البريد موجودًا في النظام، سيتم إرسال رابط إعادة التعيين إليه.",
          "success",
        );
        // خيار: يمكنك أيضاً إظهار مزيد من التعليمات أو توجيه المستخدم للـlogin بعد قليل
      } else {
        // حالات خطأ شائعة
        if (resp.status === 400) {
          // سجل الأخطاء المفصّلة إن وُجدت
          if (data && (data.errors || data.message)) {
            const err =
              data.message ||
              (data.errors
                ? Array.isArray(data.errors)
                  ? data.errors.join(" | ")
                  : JSON.stringify(data.errors)
                : null);
            showMessage(err || "البيانات المرسلة غير صحيحة.", "error");
          } else {
            showMessage("البيانات المرسلة غير صحيحة.", "error");
          }
        } else if (resp.status === 500) {
          showMessage("حصل خطأ في الخادم. حاول لاحقًا.", "error");
        } else {
          const errText =
            (data && (data.message || data.error)) ||
            `خطأ أثناء الإرسال (رمز ${resp.status})`;
          showMessage(errText, "error");
        }
      }

      console.log("ForgotPassword response:", resp.status, data);
    } catch (err) {
      console.error("Network error:", err);
      showMessage("فشل الاتصال بالخادم. تأكد من الشبكة وCORS.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "إرسال رابط الاستعادة";
    }
  });
});
