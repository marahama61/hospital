/* js/consultation.js */

document.addEventListener("DOMContentLoaded", () => {
  if (window.AppAuth && typeof window.AppAuth.initAuth === "function") {
    window.AppAuth.initAuth();
  }

  const API_BASE = "http://smarthospitalapi.somee.com";
  let appointmentId = null;
  let timerInterval = null;

  // ===== الإشعارات (Toast) =====
  window.showToast = function (message, isError = false) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${isError ? "error" : ""}`;
    toast.innerHTML = `<span>${isError ? "❌" : "✅"}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = "fadeOut 0.3s forwards";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  // ===== أدوات مساعدة (Helpers) =====
  function updateClock() {
    const el = document.getElementById("clock");
    if (!el) return;
    el.textContent = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Khartoum",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  }
  setInterval(updateClock, 1000);
  updateClock();

  function formatSudanDate(dateStr) {
    if (!dateStr) return "-";
    let dStr = dateStr;
    if (dStr && !dStr.endsWith("Z")) dStr += "Z";
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat("ar-EG", {
      timeZone: "Africa/Khartoum",
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  // دالة طلبات الـ API تدعم التقاط Error 404 بدقة
  async function apiRequest(url, options = {}) {
    const resp = await window.authFetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        accept: "*/*",
        ...options.headers,
      },
    });

    if (resp.status === 204) return null;
    if (resp.status === 404) throw new Error("404_NOT_FOUND");

    const data = await resp.json().catch(() => null);
    if (!resp.ok)
      throw new Error(data?.message || data?.error || `خطأ: ${resp.status}`);

    return data;
  }

  window.openModal = function (id) {
    document.getElementById(id)?.classList.add("show");
  };
  window.closeModal = function (id) {
    document.getElementById(id)?.classList.remove("show");
  };

  // ===== إعداد العداد الذكي =====
  function startSmartTimer(appId) {
    const storageKey = `consultation_start_${appId}`;
    let startTime = sessionStorage.getItem(storageKey);

    // إذا لم تكن هناك جلسة سابقة لهذا الموعد، احفظ وقت الآن
    if (!startTime) {
      startTime = Date.now();
      sessionStorage.setItem(storageKey, startTime);
    }

    const timerDisplay = document.getElementById("consultation-timer");

    timerInterval = setInterval(() => {
      const diffSeconds = Math.floor((Date.now() - parseInt(startTime)) / 1000);
      const minutes = Math.floor(diffSeconds / 60);
      timerDisplay.innerHTML = `${minutes} <span style="font-size: 18px; font-weight: 600;">دقيقة</span>`;
    }, 1000);
  }

  // ===== جلب وعرض الفحوصات المرتبطة (مع الـ Pagination) =====
  let currentOrdersPage = 1;
  const ordersPageSize = 10; // عدد الفحوصات في الصفحة الواحدة

  window.refreshOrderedTests = function () {
    if (appointmentId) loadOrderedTests(appointmentId, currentOrdersPage);
  };

  window.changeOrdersPage = function (newPage) {
    currentOrdersPage = newPage;
    if (appointmentId) loadOrderedTests(appointmentId, currentOrdersPage);
  };

  async function loadOrderedTests(appId, page = 1) {
    const container = document.getElementById("ordered-tests-list");
    const pager = document.getElementById("ordered-tests-pager");
    container.innerHTML =
      '<p style="color: #51607a; font-size: 14px">جاري جلب الفحوصات...</p>';

    try {
      // إرسال رقم الصفحة وحجم الصفحة في الريكويست
      const resp = await apiRequest(
        `${API_BASE}/api/TestOrder/Appointment${appId}?PageNumber=${page}&PageSize=${ordersPageSize}`,
      );
      const orders = resp?.data || [];
      const totalCount = resp?.totalCount || 0;
      const totalPages = Math.ceil(totalCount / ordersPageSize);

      if (orders.length === 0) {
        container.innerHTML =
          '<p style="color: #51607a; font-size: 14px">لا توجد فحوصات مطلوبة لهذا الموعد حالياً.</p>';
        if (pager) pager.innerHTML = "";
        return;
      }

      // جلب تفاصيل كل فحص من الكتالوج
      const enrichedOrders = await Promise.all(
        orders.map(async (o) => {
          try {
            const details = await apiRequest(
              `${API_BASE}/api/TestCatalog/Test/${o.testCatalogId}`,
            );
            return { ...o, details };
          } catch (e) {
            return { ...o, details: { name: "فحص غير معروف", price: 0 } };
          }
        }),
      );

      renderOrderedTests(enrichedOrders, container);

      // بناء أزرار التصفح (Pagination UI)
      if (pager) {
        if (totalPages > 1) {
          pager.innerHTML = `
            <div style="font-size: 13px; color: #51607a;">الصفحة ${page} من ${totalPages}</div>
            <div style="display: flex; gap: 8px;">
              <button class="btn ghost small" onclick="changeOrdersPage(${page - 1})" ${page > 1 ? "" : "disabled"}>السابق</button>
              <button class="btn ghost small" onclick="changeOrdersPage(${page + 1})" ${page < totalPages ? "" : "disabled"}>التالي</button>
            </div>
          `;
        } else {
          pager.innerHTML = "";
        }
      }
    } catch (e) {
      container.innerHTML = `<p style="color:#dc3545; font-size: 14px">تعذر جلب الفحوصات: ${e.message === "404_NOT_FOUND" ? "لا توجد فحوصات." : e.message}</p>`;
      if (pager) pager.innerHTML = "";
    }
  }

  function renderOrderedTests(orders, container) {
    container.innerHTML = "";
    orders.forEach((o) => {
      let dateStrOrigin = o.orderedOn;
      if (dateStrOrigin && !dateStrOrigin.endsWith("Z")) dateStrOrigin += "Z";
      const d = new Date(dateStrOrigin);
      const timeStr = new Intl.DateTimeFormat("ar-EG", {
        timeZone: "Africa/Khartoum",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);

      container.innerHTML += `
            <div class="test-card">
              <div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                  <span style="background:#e9eefc; color:var(--primary); padding:2px 8px; border-radius:6px; font-size:11px; font-weight:700;">رقم الطلب: ${o.id}</span>
                  <span style="font-size:12px; color:#51607a;" dir="ltr">${timeStr}</span>
                </div>
                <h4 style="margin: 0 0 12px 0; color:var(--text); font-size: 16px;">${o.details.name}</h4>
              </div>
              <button class="btn primary small" onclick="viewTestResult(${o.id}, '${o.details.name}')">عرض النتيجة</button>
            </div>
          `;
    });
  }
  // ===== عرض النتيجة =====
  window.viewTestResult = async function (orderId, testName) {
    try {
      const result = await apiRequest(
        `${API_BASE}/api/TestOrder/Result/Order/${orderId}`,
      );
      showResultModal(result, testName);
    } catch (err) {
      if (
        err.message === "404_NOT_FOUND" ||
        err.message.includes("Not Found")
      ) {
        showToast("لم يتم رفع النتيجة بعد", true);
      } else {
        showToast("حدث خطأ أثناء جلب النتيجة", true);
      }
    }
  };

  function showResultModal(res, testName) {
    document.getElementById("resModalTitle").textContent =
      `نتيجة فحص: ${testName}`;
    const content = document.getElementById("resModalContent");
    content.innerHTML = "";

    // تحديد شكل العرض بناءً على الـ ResultType
    if (res.resultType === "Numeric") {
      content.innerHTML = `
              <div style="text-align:center; padding: 30px 20px; background: #f8fafc; border-radius: 12px; border: 1px solid var(--border);">
                  <div style="font-size: 50px; font-weight: 800; color: var(--primary); line-height: 1;">${res.numericValue}</div>
                  <div style="font-size: 18px; color: #51607a; margin-top: 10px; font-weight: 700;">${res.unit || ""}</div>
              </div>
          `;
    } else if (res.resultType === "Text") {
      content.innerHTML = `
              <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid var(--border); white-space: pre-wrap; color: #223244; line-height: 1.8; font-size: 15px;">${res.textValue}</div>
          `;
    } else if (res.resultType === "Image") {
      const fullUrl = res.fileUrl.startsWith("http")
        ? res.fileUrl
        : API_BASE + res.fileUrl;
      content.innerHTML = `
              <div style="text-align:center; background: #f8fafc; padding: 10px; border-radius: 12px; border: 1px solid var(--border);">
                  <img src="${fullUrl}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" alt="صورة الفحص" />
                  <div style="margin-top: 15px;">
                      <a href="${fullUrl}" target="_blank" class="btn ghost small">فتح الصورة في نافذة جديدة</a>
                  </div>
              </div>
          `;
    } else if (res.resultType === "File") {
      const fullUrl = res.fileUrl.startsWith("http")
        ? res.fileUrl
        : API_BASE + res.fileUrl;
      content.innerHTML = `
              <div style="text-align:center; padding: 40px 20px; background: #f8fafc; border-radius: 12px; border: 1px solid var(--border);">
                  <div style="font-size: 60px; margin-bottom: 10px;">📄</div>
                  <h4 style="margin: 0 0 20px 0; color: #33415a;">يوجد ملف مرفق مع هذه النتيجة</h4>
                  <a href="${fullUrl}" target="_blank" class="btn primary">تحميل / عرض الملف</a>
              </div>
          `;
    }
    openModal("testResultModal");
  }

  // ===== تهيئة الجلسة الأساسية =====
  async function initConsultation() {
    const urlParams = new URLSearchParams(window.location.search);
    appointmentId = urlParams.get("appointmentId");

    if (!appointmentId) {
      alert("رقم الموعد غير متوفر! سيتم إعادتك للوحة التحكم.");
      window.location.href = "doctor-dashboard.html";
      return;
    }

    try {
      const response = await apiRequest(
        `${API_BASE}/api/Appointment/doctor?PageNumber=1&PageSize=50`,
      );
      const appointments = response?.data || [];
      const currentAppt = appointments.find(
        (a) => String(a.id) === String(appointmentId),
      );

      if (!currentAppt) {
        throw new Error(
          "لم يتم العثور على بيانات الموعد. قد يكون في صفحة أخرى أو تم حذفه.",
        );
      }

      // تعبئة البيانات في الواجهة
      document.getElementById("lbl-apt-id").textContent = currentAppt.id;
      document.getElementById("lbl-patient-name").textContent =
        currentAppt.patientName || "غير معروف";
      document.getElementById("lbl-apt-date").textContent = formatSudanDate(
        currentAppt.appointmentDateTime,
      );

      const statusRaw = String(currentAppt.status || "")
        .toLowerCase()
        .trim();
      document.getElementById("lbl-apt-status").innerHTML =
        `<span style="color:var(--primary); font-weight:700;">${statusRaw === "scheduled" ? "مجدول" : currentAppt.status}</span>`;

      // إخفاء التحميل وإظهار المحتوى
      document.getElementById("loading-overlay").style.display = "none";
      document.getElementById("consultation-content").style.display = "grid";

      // بدء العداد الذكي وجلب الفحوصات المرتبطة
      startSmartTimer(appointmentId);
      loadOrderedTests(appointmentId);
    } catch (error) {
      document.getElementById("loading-overlay").innerHTML =
        `<span style="color:#b00020;">${error.message}</span>
         <br><br><a href="doctor-dashboard.html" class="btn">العودة للوحة</a>`;
    }
  }

  // ===== إنهاء الجلسة =====
  window.confirmComplete = function () {
    openModal("completeModal");
  };

  document
    .getElementById("btn-confirm-complete")
    ?.addEventListener("click", async () => {
      const statusEl = document.getElementById("completeStatus");
      const btn = document.getElementById("btn-confirm-complete");

      try {
        btn.disabled = true;
        btn.textContent = "جاري الإنهاء...";

        await apiRequest(
          `${API_BASE}/api/Appointment/complete/${appointmentId}`,
          { method: "PUT" },
        );

        statusEl.innerHTML = `<p style="color:#198754; font-weight:bold;">تم إنهاء الجلسة بنجاح! جاري تحويلك...</p>`;

        // إيقاف العداد وحذف التخزين لتبدأ جلسة جديدة إن لزم الأمر مستقبلاً
        clearInterval(timerInterval);
        sessionStorage.removeItem(`consultation_start_${appointmentId}`);

        setTimeout(() => {
          window.location.href = "doctor-dashboard.html";
        }, 1500);
      } catch (err) {
        statusEl.innerHTML = `<p style="color:#dc3545;">تعذر إنهاء الموعد: ${err.message}</p>`;
        btn.disabled = false;
        btn.textContent = "نعم، إنهاء الموعد";
      }
    });

  window.goToOrderTests = function () {
    if (!appointmentId) return alert("رقم الموعد غير متوفر!");
    window.location.href = `order-tests.html?appointmentId=${appointmentId}`;
  };
  window.goToprescriptions = function () {
    if (!appointmentId) return alert("رقم الموعد غير متوفر!");
    window.location.href = "prescription.html?appointmentId=" + appointmentId;
  };
  initConsultation();
});
