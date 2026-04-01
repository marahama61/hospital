document.addEventListener("DOMContentLoaded", () => {
  if (window.AppAuth) window.AppAuth.initAuth();
  const API_BASE = "http://smarthospitalapi.somee.com";
  let currentPage = 1;
  const pageSize = 20;
  const drugCache = {}; // تخزين مؤقت لبيانات الأدوية

  // تحديث الساعة
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

  // دالة الإشعارات
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

  // دالة الاتصال بالخادم الذكية
  async function apiRequest(url, options = {}) {
    const headers = { accept: "*/*", ...options.headers };
    if (!options.body || !(options.body instanceof FormData)) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }

    // افتراض استخدام authFetch من الملفات المساعدة، أو استخدام fetch العادي إذا لم تكن موجودة
    const fetchFunc = window.authFetch || fetch;
    const resp = await fetchFunc(url, { ...options, headers: headers });

    if (resp.status === 204) return null;
    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      if (resp.status === 401 && window.AppLogout) window.AppLogout.logout();
      let errMsg = `خطأ: ${resp.status}`;
      if (data) {
        if (typeof data === "string") errMsg = data;
        else if (data.message) errMsg = data.message;
        else if (data.title) errMsg = data.title;
        if (data.errors && Object.keys(data.errors).length > 0) {
          const firstKey = Object.keys(data.errors)[0];
          errMsg = data.errors[firstKey][0];
        }
      }
      throw new Error(errMsg);
    }
    return data;
  }

  // إدارة القوائم المنسدلة والنوافذ المنبثقة
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

  // جلب تفاصيل الدواء مع الكاش
  async function getDrugDetails(drugId) {
    if (drugCache[drugId]) return drugCache[drugId];
    try {
      const data = await apiRequest(
        `${API_BASE}/api/Prescription/Drug/${drugId}`,
      );
      drugCache[drugId] = data;
      return data;
    } catch (e) {
      return { tradeName: "دواء غير معروف", genericName: "-" };
    }
  }

  // جلب الروشتات
  async function loadPrescriptions(page = 1) {
    const container = document.getElementById("prescriptions-list");
    const pager = document.getElementById("prescriptions-pager");
    container.innerHTML =
      '<p style="color: #51607a;">جاري تحميل الروشتات...</p>';

    try {
      const response = await apiRequest(
        `${API_BASE}/api/Prescription?PageNumber=${page}&PageSize=${pageSize}`,
      );
      let prescriptions = response?.data || [];

      if (prescriptions.length === 0) {
        container.innerHTML = "<p>لا توجد روشتات متاحة حالياً.</p>";
        pager.innerHTML = "";
        return;
      }

      container.innerHTML = "";
      const frag = document.createDocumentFragment();

      // بناء كل كرت روشتة
      for (const rx of prescriptions) {
        let dateStrOrigin = rx.dateIssued;
        if (dateStrOrigin && !dateStrOrigin.endsWith("Z")) dateStrOrigin += "Z";
        const dateStr = new Intl.DateTimeFormat("ar-EG", {
          timeZone: "Africa/Khartoum",
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(dateStrOrigin));

        const card = document.createElement("div");
        card.className = "test-card";

        let headerHtml = `
          <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
            <span style="background:#e9eefc; color:var(--primary); padding:4px 8px; border-radius:6px; font-size:12px; font-weight:700;">روشتة #${rx.id}</span>
            <span style="font-size:12px; color:#51607a;" dir="ltr">${dateStr}</span>
          </div>
          <h3 style="margin:0 0 6px 0; color:var(--text);">${rx.patientName}</h3>
          <div style="font-size:13px; color:#51607a; margin-bottom:12px;">
            طبيب: <strong>${rx.doctorName}</strong> | الحالة: <strong style="color:var(--warning)">${rx.status}</strong>
          </div>
          <div class="drugs-container" style="display:flex; flex-direction:column; gap:8px;">
        `;

        // جلب الأدوية داخل الروشتة
        let drugsHtml = "";
        for (const item of rx.prescriptionItems) {
          const drugInfo = await getDrugDetails(item.drugCatalogId);
          drugsHtml += `
            <div class="drug-item">
              <div class="drug-details">
                <h4>${drugInfo.tradeName}</h4>
                <p>الكمية: ${item.quantity} | ${item.instructions}</p>
              </div>
              <button class="btn primary small" onclick="dispenseDrug(this, ${rx.id}, ${item.drugCatalogId}, ${item.quantity})">
                صرف
              </button>
            </div>
          `;
        }

        card.innerHTML = headerHtml + drugsHtml + `</div>`;
        frag.appendChild(card);
      }

      container.appendChild(frag);

      // نظام الصفحات
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

  // صرف الدواء
  window.dispenseDrug = async function (btn, prescriptionId, drugId, quantity) {
    const originalText = btn.innerHTML;
    btn.innerHTML = "جاري...";
    btn.disabled = true;

    try {
      await apiRequest(
        `${API_BASE}/api/Prescription/Dispensed-Drug/${prescriptionId}/${drugId}/${quantity}`,
        {
          method: "PUT",
        },
      );
      showToast("تم صرف الروشتة بنجاح");
      btn.innerHTML = "تم الصرف";
      btn.classList.replace("primary", "success");
    } catch (err) {
      showToast(err.message, true);
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  };

  window.changePage = (p) => {
    currentPage = p;
    loadPrescriptions(p);
  };

  document
    .getElementById("refreshPrescriptionsBtn")
    ?.addEventListener("click", () => loadPrescriptions(currentPage));

  // تغيير كلمة المرور
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
          <button type="submit" class="btn primary">تحديث</button>
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

  document.getElementById("btn-logout")?.addEventListener("click", () => {
    if (window.AppLogout) window.AppLogout.logout();
  });

  // التحميل الأولي
  loadPrescriptions();
});
