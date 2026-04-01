const API = "http://smarthospitalapi.somee.com/api/Register/ResetPassword";

const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirmPassword");

function showError(id) {
  document.getElementById(id).style.display = "block";
}

function hideError(id) {
  document.getElementById(id).style.display = "none";
}

/* قراءة البيانات من الرابط */

const params = new URLSearchParams(window.location.search);
const email = params.get("email");
const token = params.get("token");

if (!email || !token) {
  alert("الرابط غير صالح");
}

/* التحقق من كلمة المرور */

password.addEventListener("blur", function () {
  const pattern = /^(?=.*[a-z])(?=.*[A-Z]).{6,}$/;

  if (!pattern.test(password.value)) {
    showError("passwordError");
  } else {
    hideError("passwordError");
  }
});

/* التحقق من التطابق */

confirmPassword.addEventListener("blur", function () {
  if (confirmPassword.value !== password.value) {
    showError("confirmError");
  } else {
    hideError("confirmError");
  }
});

/* إرسال الريكويست */

document
  .getElementById("resetForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const pattern = /^(?=.*[a-z])(?=.*[A-Z]).{6,}$/;

    if (
      !pattern.test(password.value) ||
      confirmPassword.value !== password.value
    ) {
      alert("يرجى تصحيح الأخطاء");
      return;
    }

    try {
      const response = await fetch(API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email,
          newPassword: password.value,
          confirmPassword: confirmPassword.value,
          token: token,
        }),
      });

      const data = await response.text();

      if (response.ok) {
        alert("تم تغيير كلمة المرور بنجاح");
        window.location.href = "login.html";
      } else {
        alert("فشل تغيير كلمة المرور: " + data);
      }
    } catch (error) {
      alert("حدث خطأ في الاتصال بالسيرفر");
    }
  });
