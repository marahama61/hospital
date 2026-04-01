/* js/labtech-dashboard.js */
document.addEventListener("DOMContentLoaded", () => {
  if (window.AppAuth) window.AppAuth.initAuth();
  const API_BASE = "http://smarthospitalapi.somee.com";
  let currentPage = 1;
  const pageSize = 20;

  setInterval(() => {
    const el = document.getElementById("clock");
    if (el)
      el.textContent = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Khartoum",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
  }, 1000);

  window.showToast = function (message, isError = false) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${isError ? "error" : ""}`;
    toast.innerHTML = `<span>${isError ? "❌" : "✅"}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = "fadeOut 0.3s forwards";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  // دالة ذكية لاستخراج رسائل الخطأ من ASP.NET Core وتدعم FormData للملفات
  async function apiRequest(url, options = {}) {
    const headers = {
      accept: "*/*",
      ...options.headers,
    };

    // لو البيانات المرفوعة FormData، المتصفح حيضع Content-Type تلقائياً عشان الـ boundary
    if (options.body && options.body instanceof FormData) {
      delete headers["Content-Type"];
    } else {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }

    const resp = await window.authFetch(url, {
      ...options,
      headers: headers,
    });

    if (resp.status === 204) return null;
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      if (resp.status === 401) window.AppLogout?.logout();
      let errMsg = `خطأ: ${resp.status}`;
      if (data) {
        if (typeof data === "string") errMsg = data;
        else if (data.message) errMsg = data.message;
        else if (data.title) errMsg = data.title;
        // استخراج أخطاء الـ Validation
        if (data.errors && Object.keys(data.errors).length > 0) {
          const firstKey = Object.keys(data.errors)[0];
          errMsg = data.errors[firstKey][0];
        }
      }
      throw new Error(errMsg);
    }
    return data;
  }

  window.openModal = (id) => document.getElementById(id)?.classList.add("show");
  window.closeAllModals = () =>
    document
      .querySelectorAll(".modal-backdrop")
      .forEach((m) => m.classList.remove("show"));

  const accountBtn = document.getElementById("accountSettingsBtn");
  const dropdown = document.getElementById("userDropdown");
  accountBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("show");
  });
  document.addEventListener("click", () => dropdown?.classList.remove("show"));
  document.querySelectorAll(".modal-backdrop").forEach((m) =>
    m.addEventListener("click", (e) => {
      if (e.target === m) closeAllModals();
    }),
  );

  async function loadOrders(page = 1) {
    const container = document.getElementById("orders-list");
    const pager = document.getElementById("orders-pager");
    container.innerHTML =
      '<p style="color: #51607a;">جاري تحميل الطلبات...</p>';

    try {
      const response = await apiRequest(
        `${API_BASE}/api/TestOrder/Orders?PageNumber=${page}&PageSize=${pageSize}`,
      );
      let orders = response?.data || [];

      if (orders.length === 0) {
        container.innerHTML =
          "<p>لا توجد طلبات فحوصات حالياً (تحتاج إلى المعالجة).</p>";
        pager.innerHTML = "";
        return;
      }

      const enrichedOrders = await Promise.all(
        orders.map(async (order) => {
          try {
            const testDetails = await apiRequest(
              `${API_BASE}/api/TestCatalog/Test/${order.testCatalogId}`,
            );
            return { ...order, testDetails };
          } catch (e) {
            return {
              ...order,
              testDetails: { name: "غير معروف", price: 0, duration: "-" },
            };
          }
        }),
      );

      renderOrders(enrichedOrders, container);

      const totalCount = response?.totalCount || 0;
      const totalPages = Math.ceil(totalCount / pageSize);

      if (totalPages > 1) {
        pager.innerHTML = `
          <div class="pager-info">الصفحة ${page} من ${totalPages}</div>
          <div class="pager-actions">
            <button class="btn ghost small" onclick="changePage(${page - 1})" ${page > 1 ? "" : "disabled"}>السابق</button>
            <button class="btn ghost small" onclick="changePage(${page + 1})" ${page < totalPages ? "" : "disabled"}>التالي</button>
          </div>
        `;
      } else pager.innerHTML = "";
    } catch (err) {
      container.innerHTML = `<p style="color:#b00020">فشل التحميل: ${err.message}</p>`;
    }
  }

  function renderOrders(orders, container) {
    container.innerHTML = "";
    const frag = document.createDocumentFragment();
    orders.forEach((o) => {
      let dateStrOrigin = o.orderedOn;
      if (dateStrOrigin && !dateStrOrigin.endsWith("Z")) {
        dateStrOrigin += "Z";
      }

      const d = new Date(dateStrOrigin);
      const dateStr = new Intl.DateTimeFormat("ar-EG", {
        timeZone: "Africa/Khartoum",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);

      const card = document.createElement("div");
      card.className = "test-card";
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
          <span style="background:#e9eefc; color:var(--primary); padding:4px 8px; border-radius:6px; font-size:12px; font-weight:700;">رقم الطلب: ${o.id}</span>
          <span style="font-size:12px; color:#51607a;" dir="ltr">${dateStr}</span>
        </div>
        <h3 style="margin:0 0 6px 0; color:var(--text);">${o.testDetails.name}</h3>
        <div style="font-size:13px; color:#51607a; margin-bottom:12px;">
          المريض ID: <strong>${o.patientId}</strong> | موعد ID: <strong>${o.appointmentId}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; background:#f8fafc; padding:8px; border-radius:8px; font-size:12px; font-weight:700; margin-bottom:16px;">
          <span>المدة: ${o.testDetails.duration || "-"}</span>
          <span style="color:var(--success)">السعر: ${o.testDetails.price} SDG</span>
        </div>
        <button class="btn primary" onclick="openAddResultModal(${o.id})" style="width:100%">إضافة النتيجة</button>
      `;
      frag.appendChild(card);
    });
    container.appendChild(frag);
  }

  window.changePage = (p) => {
    currentPage = p;
    loadOrders(p);
  };

  document
    .getElementById("refreshOrdersBtn")
    ?.addEventListener("click", () => loadOrders(currentPage));

  // --- دوال رفع النتيجة الديناميكية ---
  window.openAddResultModal = function (orderId) {
    document.getElementById("modal-order-id").value = orderId;
    document.getElementById("modal-order-id-display").textContent = orderId;
    document.getElementById("resultForm").reset();

    // إخفاء جميع الحقول في البداية
    document.getElementById("numericFields").style.display = "none";
    document.getElementById("textFields").style.display = "none";
    document.getElementById("fileFields").style.display = "none";

    openModal("addResultModal");
  };

  document.getElementById("resultType").addEventListener("change", function () {
    const val = this.value;
    document.getElementById("numericFields").style.display =
      val === "Numeric" ? "flex" : "none";
    document.getElementById("textFields").style.display =
      val === "Text" ? "block" : "none";
    document.getElementById("fileFields").style.display =
      val === "Image" || val === "File" ? "block" : "none";
  });

  document
    .getElementById("resultForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();
      const btn = document.getElementById("btnSubmitResult");
      const orderId = document.getElementById("modal-order-id").value;
      const type = document.getElementById("resultType").value;

      if (!type) return showToast("الرجاء اختيار نوع النتيجة", true);

      const formData = new FormData();
      formData.append("TestOrderId", orderId);

      // ربط القيمة النصية مع الـ Enum الموجود في C# (0=Numeric, 1=Text, 2=Image, 3=File)
      // الطريقة دي آمنة جداً عشان الـ Model Binding يتعرف عليها كـ Integer
      const enumMap = { Numeric: 0, Text: 1, Image: 2, File: 3 };
      formData.append("ResultType", enumMap[type]);

      if (type === "Numeric") {
        const nv = document.getElementById("numericValue").value;
        const uv = document.getElementById("unitValue").value;
        if (!nv || !uv)
          return showToast("القيمة الرقمية ووحدة القياس مطلوبة", true);
        formData.append("NumericValue", nv);
        formData.append("Unit", uv);
      } else if (type === "Text") {
        const tv = document.getElementById("textValue").value;
        if (!tv) return showToast("النتيجة النصية مطلوبة", true);
        formData.append("TextValue", tv);
      } else if (type === "Image" || type === "File") {
        const fileInput = document.getElementById("fileValue");
        if (!fileInput.files.length)
          return showToast("الرجاء اختيار ملف أو صورة", true);
        formData.append("File", fileInput.files[0]);
      }

      btn.disabled = true;
      btn.textContent = "جاري الرفع...";

      try {
        // إرسال الطلب، لاحظ إني بستخدم /api/TestOrder/Result بناءً على اسم الميثود عندك
        await apiRequest(`${API_BASE}/api/TestOrder/Result`, {
          method: "POST",
          body: formData,
        });

        showToast("تم رفع النتيجة بنجاح وتحويل الطلب لـ Completed!");
        closeAllModals();
        loadOrders(currentPage); // عشان الطلب المكتمل يختفي من القائمة
      } catch (err) {
        showToast(err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = "رفع النتيجة وحفظ";
      }
    });
  // --- نهاية دوال رفع النتيجة ---

  document
    .getElementById("btn-change-password")
    ?.addEventListener("click", () => {
      openModal("changePassModal");
      document.getElementById("changePassModalContent").innerHTML = `
      <div style="padding:20px;">
        <h3>تغيير كلمة المرور</h3>
        <div id="passStatus"></div>
        <form id="passForm" style="display:grid; gap:12px; margin-top:15px;">
          <input type="password" id="currentPassword" placeholder="كلمة المرور الحالية" required class="input">
          <input type="password" id="newPassword" placeholder="كلمة المرور الجديدة" required class="input">
          <input type="password" id="confirmNewPassword" placeholder="تأكيد كلمة المرور الجديدة" required class="input">
          <div style="display:flex; gap:10px; justify-content:flex-end;">
            <button type="button" class="btn ghost" onclick="closeAllModals()">إلغاء</button>
            <button type="submit" class="btn">تحديث</button>
          </div>
        </form>
      </div>`;

      document.getElementById("passForm").onsubmit = async (e) => {
        e.preventDefault();
        const cp = document.getElementById("currentPassword").value;
        const np = document.getElementById("newPassword").value;
        const cnp = document.getElementById("confirmNewPassword").value;

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
        if (!passwordRegex.test(np)) {
          return showToast(
            "كلمة المرور يجب أن تحتوي على 6 خانات، حرف كبير، حرف صغير، ورقم على الأقل.",
            true,
          );
        }

        if (np !== cnp) return showToast("كلمتا المرور غير متطابقتين", true);

        try {
          await apiRequest(`${API_BASE}/api/Register/change-password`, {
            method: "POST",
            body: JSON.stringify({
              currentPassword: cp,
              newPassword: np,
              confirmNewPassword: cnp,
            }),
          });
          showToast("تم التغيير بنجاح!");
          closeAllModals();
        } catch (err) {
          showToast(err.message, true);
        }
      };
    });

  document
    .getElementById("btn-logout")
    ?.addEventListener("click", () => window.AppLogout.logout());

  loadOrders();
});
