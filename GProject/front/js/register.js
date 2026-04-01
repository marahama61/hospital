// js/register.js
document.addEventListener("DOMContentLoaded", () => {
  // ===== DOM elements =====
  const form = document.getElementById("registerForm");
  const submitBtn = document.getElementById("submitBtn");

  const firstName = document.getElementById("firstName");
  const lastName = document.getElementById("lastName");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const confirmPassword = document.getElementById("confirmPassword");
  const phone = document.getElementById("phone");
  const address = document.getElementById("address");
  const date = document.getElementById("date");
  const gender = document.getElementById("gender");

  const strengthBar = document.getElementById("strengthBar");
  const globalMessage = document.getElementById("globalMessage");

  // ===== API base =====
  const API_BASE = "http://smarthospitalapi.somee.com";

  // ===== helper UI functions =====
  function setGlobalMessage(text, type = "error") {
    globalMessage.textContent = text;
    globalMessage.className =
      "message show " + (type === "success" ? "success" : "error");
  }

  function clearGlobalMessage() {
    globalMessage.textContent = "";
    globalMessage.className = "message";
  }

  function showError(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = "block";
  }

  function hideError(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }

  // ===== password strength =====
  password.addEventListener("input", () => {
    let pass = password.value || "";
    let score = 0;
    if (pass.length >= 6) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;

    if (score <= 2) {
      strengthBar.style.background = "linear-gradient(90deg, #dc3545, #ff6b6b)";
      strengthBar.style.width = "35%";
    } else if (score === 3) {
      strengthBar.style.background = "linear-gradient(90deg, #ffc107, #ffd65c)";
      strengthBar.style.width = "70%";
    } else {
      strengthBar.style.background = "linear-gradient(90deg, #198754, #31c48d)";
      strengthBar.style.width = "100%";
    }
  });

  // ===== field-level errors =====
  function showErrorField(input, errorId) {
    input.classList.add("invalid");
    input.classList.remove("success");
    showError(errorId);
  }

  function showSuccessField(input, errorId) {
    input.classList.remove("invalid");
    input.classList.add("success");
    hideError(errorId);
  }

  firstName.onblur = () => {
    if (firstName.value.trim() === "")
      showErrorField(firstName, "firstNameError");
    else showSuccessField(firstName, "firstNameError");
  };

  lastName.onblur = () => {
    if (lastName.value.trim() === "") showErrorField(lastName, "lastNameError");
    else showSuccessField(lastName, "lastNameError");
  };

  email.onblur = () => {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!pattern.test(email.value)) showErrorField(email, "emailError");
    else showSuccessField(email, "emailError");
  };

  password.onblur = () => {
    const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
    if (!pattern.test(password.value))
      showErrorField(password, "passwordError");
    else showSuccessField(password, "passwordError");
  };

  confirmPassword.onblur = () => {
    if (confirmPassword.value !== password.value)
      showErrorField(confirmPassword, "confirmError");
    else showSuccessField(confirmPassword, "confirmError");
  };

  phone.onblur = () => {
    if (phone.value.trim() === "") showErrorField(phone, "phoneError");
    else showSuccessField(phone, "phoneError");
  };

  address.onblur = () => {
    if (address.value.trim() === "") showErrorField(address, "addressError");
    else showSuccessField(address, "addressError");
  };

  date.onblur = () => {
    if (!date.value) showErrorField(date, "dateError");
    else showSuccessField(date, "dateError");
  };

  gender.onblur = () => {
    if (!gender.value) showErrorField(gender, "genderError");
    else showSuccessField(gender, "genderError");
  };

  // ===== form validation =====
  function validateForm() {
    let ok = true;

    if (firstName.value.trim() === "") {
      showErrorField(firstName, "firstNameError");
      ok = false;
    } else showSuccessField(firstName, "firstNameError");

    if (lastName.value.trim() === "") {
      showErrorField(lastName, "lastNameError");
      ok = false;
    } else showSuccessField(lastName, "lastNameError");

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email.value)) {
      showErrorField(email, "emailError");
      ok = false;
    } else showSuccessField(email, "emailError");

    const passPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
    if (!passPattern.test(password.value)) {
      showErrorField(password, "passwordError");
      ok = false;
    } else showSuccessField(password, "passwordError");

    if (confirmPassword.value !== password.value) {
      showErrorField(confirmPassword, "confirmError");
      ok = false;
    } else showSuccessField(confirmPassword, "confirmError");

    if (phone.value.trim() === "") {
      showErrorField(phone, "phoneError");
      ok = false;
    } else showSuccessField(phone, "phoneError");

    if (address.value.trim() === "") {
      showErrorField(address, "addressError");
      ok = false;
    } else showSuccessField(address, "addressError");

    if (!date.value) {
      showErrorField(date, "dateError");
      ok = false;
    } else showSuccessField(date, "dateError");

    if (!gender.value) {
      showErrorField(gender, "genderError");
      ok = false;
    } else showSuccessField(gender, "genderError");

    return ok;
  }

  // ===== API request =====
  async function sendRegistration(payload) {
    clearGlobalMessage();
    submitBtn.disabled = true;
    setGlobalMessage("جاري إرسال بيانات التسجيل...", "success");

    try {
      const resp = await fetch(API_BASE + "/api/Register", {
        method: "POST",
        headers: {
          Accept: "*/*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => null);

      if (resp.ok) {
        const msg =
          (data && data.message) ||
          "تم إنشاء الحساب بنجاح، يمكنك الآن تسجيل الدخول.";
        setGlobalMessage(msg, "success");
        form.reset();

        // إزالة علامات النجاح/الخطأ من الحقول بعد نجاح التسجيل
        [
          firstName,
          lastName,
          email,
          password,
          confirmPassword,
          phone,
          address,
          date,
          gender,
        ].forEach((el) => {
          el.classList.remove("invalid", "success");
        });

        strengthBar.style.width = "0";
        strengthBar.style.background = "#ddd";
      } else {
        if (resp.status === 400) {
          if (data) {
            if (data.errors) {
              const errs = [];
              for (const k in data.errors) {
                if (Array.isArray(data.errors[k])) errs.push(...data.errors[k]);
              }
              if (errs.length) {
                setGlobalMessage(errs.join(" | "), "error");
              } else {
                setGlobalMessage(
                  data.message || "البيانات المرسلة غير صحيحة",
                  "error",
                );
              }
            } else {
              setGlobalMessage(
                data.message || "البيانات المرسلة غير صحيحة",
                "error",
              );
            }
          } else {
            setGlobalMessage("البيانات المرسلة غير صحيحة (400).", "error");
          }
        } else if (resp.status === 409) {
          setGlobalMessage("مستخدم بهذا البريد مسجل سابقاً.", "error");
        } else if (resp.status === 500) {
          setGlobalMessage("حصل خطأ بالخادم (500). حاول لاحقاً.", "error");
        } else {
          const m =
            (data && (data.message || data.errorMessage)) ||
            `خطأ غير متوقع (${resp.status})`;
          setGlobalMessage(m, "error");
        }

        console.warn("Register failed:", resp.status, data);
      }
    } catch (err) {
      console.error("Network or other error:", err);
      setGlobalMessage(
        "خطأ في الاتصال. تأكد من إعدادات الشبكة وCORS.",
        "error",
      );
    } finally {
      submitBtn.disabled = false;
    }
  }

  // ===== submit =====
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearGlobalMessage();

    if (!validateForm()) {
      setGlobalMessage("يرجى تصحيح الأخطاء في النموذج.", "error");
      return;
    }

    const payload = {
      email: email.value.trim(),
      password: password.value,
      confirmPassword: confirmPassword.value,
      firstName: firstName.value.trim(),
      lastName: lastName.value.trim(),
      phoneNumber: phone.value.trim(),
      dateOfBirth: date.value ? new Date(date.value).toISOString() : null,
      gender: gender.value,
      address: address.value.trim(),
    };

    sendRegistration(payload);
  });

  form.setAttribute("novalidate", "true");
});
