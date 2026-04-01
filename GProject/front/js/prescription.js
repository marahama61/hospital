/* js/prescription.js */

document.addEventListener("DOMContentLoaded", () => {
  if (window.AppAuth && typeof window.AppAuth.initAuth === "function") {
    window.AppAuth.initAuth();
  }

  const API_BASE = "http://smarthospitalapi.somee.com";
  let appointmentId = null;
  let allLoadedDrugs = []; // حفظ الأدوية المحملة للفلترة المباشرة
  let selectedDrugs = []; // السلة
  let currentPage = 1;
  const pageSize = 20;

  // ===== إعداد التوقيت =====
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

  // ===== إعداد رابط العودة =====
  const urlParams = new URLSearchParams(window.location.search);
  appointmentId = urlParams.get("appointmentId");
  if (!appointmentId) {
    alert("رقم الموعد غير متوفر! سيتم إعادتك للوحة التحكم.");
    window.location.href = "doctor-dashboard.html";
    return;
  }
  document.getElementById("backToConsultation").href =
    `consultation.html?appointmentId=${appointmentId}`;

  // ===== الإشعارات والمودال =====
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

  window.closeAllModals = function () {
    document.getElementById("instructionsModal").classList.remove("show");
  };

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
    const data = await resp.json().catch(() => null);
    if (!resp.ok)
      throw new Error(data?.message || data?.title || `خطأ: ${resp.status}`);
    return data;
  }

  // ===== جلب الأدوية والفلترة =====
  async function loadDrugs(page = 1) {
    const grid = document.getElementById("drugs-grid");
    const pager = document.getElementById("pager");
    const loader = document.getElementById("loading-overlay");

    grid.style.display = "none";
    pager.style.display = "none";
    loader.style.display = "block";

    try {
      const resp = await apiRequest(
        `${API_BASE}/api/Prescription/Drugs?PageNumber=${page}&PageSize=${pageSize}`,
      );
      allLoadedDrugs = resp?.data || [];
      const totalCount = resp?.totalCount || 0;
      const totalPages = Math.ceil(totalCount / pageSize);

      // تفريغ حقول البحث عند تغيير الصفحة لتجنب تضارب النتائج
      document.getElementById("searchTrade").value = "";
      document.getElementById("searchGeneric").value = "";

      renderDrugs(allLoadedDrugs);
      renderPager(page, totalPages);
    } catch (err) {
      grid.style.display = "block";
      grid.innerHTML = `<p style="color: var(--danger); font-weight: 700;">تعذر تحميل الأدوية: ${err.message}</p>`;
    } finally {
      loader.style.display = "none";
      grid.style.display = "grid";
      pager.style.display = "flex";
    }
  }

  function renderDrugs(drugsList) {
    const grid = document.getElementById("drugs-grid");
    grid.innerHTML = "";

    if (drugsList.length === 0) {
      grid.innerHTML = `<p style="color: #51607a; grid-column: 1 / -1;">لا توجد أدوية مطابقة للبحث.</p>`;
      return;
    }

    drugsList.forEach((drug) => {
      const isSelected = selectedDrugs.some((d) => d.id === drug.id);

      grid.innerHTML += `
        <div class="drug-card">
          <div>
            <h3 class="drug-trade">${drug.tradeName}</h3>
            <p class="drug-generic">${drug.genericName}</p>
            <p class="drug-desc">${drug.description || "لا يوجد وصف"}</p>
            <div class="drug-meta">
              <span>الشركة: ${drug.manufacturer}</span>
              <span style="color: ${drug.stockQuantity > 0 ? "var(--success)" : "var(--danger)"}">
                المخزون: ${drug.stockQuantity}
              </span>
            </div>
          </div>
          <button class="btn ${isSelected ? "ghost" : "primary"}" 
                  ${isSelected ? "disabled" : ""}
                  onclick="addToCart(${drug.id})">
            ${isSelected ? "✅ تمت الإضافة للروشتة" : "+ إضافة للروشتة"}
          </button>
        </div>
      `;
    });
  }

  // الفلترة الفورية (Client-Side Search) - 100% شغالة على بيانات الصفحة
  function handleSearch() {
    const tradeQ = document
      .getElementById("searchTrade")
      .value.toLowerCase()
      .trim();
    const genericQ = document
      .getElementById("searchGeneric")
      .value.toLowerCase()
      .trim();

    const filtered = allLoadedDrugs.filter((d) => {
      const matchTrade = (d.tradeName || "").toLowerCase().includes(tradeQ);
      const matchGeneric = (d.genericName || "")
        .toLowerCase()
        .includes(genericQ);
      return matchTrade && matchGeneric;
    });

    renderDrugs(filtered);
  }

  document
    .getElementById("searchTrade")
    .addEventListener("input", handleSearch);
  document
    .getElementById("searchGeneric")
    .addEventListener("input", handleSearch);

  function renderPager(page, totalPages) {
    const pager = document.getElementById("pager");
    if (totalPages <= 1) {
      pager.innerHTML = "";
      return;
    }
    pager.innerHTML = `
      <div style="font-size: 13px; color: #51607a; font-weight: 700;">الصفحة ${page} من ${totalPages}</div>
      <div style="display: flex; gap: 8px;">
        <button class="btn ghost small" onclick="changePage(${page - 1})" ${page > 1 ? "" : "disabled"}>السابق</button>
        <button class="btn ghost small" onclick="changePage(${page + 1})" ${page < totalPages ? "" : "disabled"}>التالي</button>
      </div>
    `;
  }

  window.changePage = function (newPage) {
    currentPage = newPage;
    loadDrugs(newPage);
  };

  // ===== إدارة السلة (الروشتة) =====
  window.addToCart = function (drugId) {
    const drug = allLoadedDrugs.find((d) => d.id === drugId);
    if (!drug) return;
    if (selectedDrugs.some((d) => d.id === drugId)) return; // تفادي التكرار

    selectedDrugs.push(drug);
    updateCartUI();
    handleSearch(); // لإعادة رسم الـ Grid وتحديث حالة الزر إلى "تمت الإضافة"
  };

  window.removeFromCart = function (drugId) {
    selectedDrugs = selectedDrugs.filter((d) => d.id !== drugId);
    updateCartUI();
    handleSearch(); // لتفعيل الزر في الـ Grid مرة أخرى
  };

  function updateCartUI() {
    const container = document.getElementById("cart-container");
    const countEl = document.getElementById("cart-count");
    const btnOpen = document.getElementById("btn-open-instructions");

    countEl.textContent = selectedDrugs.length;

    if (selectedDrugs.length === 0) {
      container.innerHTML = `
        <p style="color: #51607a; font-size: 13px; text-align: center; margin-top: 20px;">
          لم يتم اختيار أي أدوية بعد.<br>يرجى إضافة الأدوية من القائمة.
        </p>`;
      btnOpen.disabled = true;
      return;
    }

    btnOpen.disabled = false;
    container.innerHTML = "";
    selectedDrugs.forEach((d) => {
      container.innerHTML += `
        <div class="cart-item">
          <div>
            <h4>${d.tradeName}</h4>
            <p>${d.genericName}</p>
          </div>
          <button class="btn danger small" onclick="removeFromCart(${d.id})" style="padding: 4px 8px; font-size: 11px;">إزالة</button>
        </div>
      `;
    });
  }

  // ===== إنهاء الروشتة وإضافة التعليمات =====
  window.openInstructionsModal = function () {
    const listContainer = document.getElementById("instructions-list");
    listContainer.innerHTML = "";

    selectedDrugs.forEach((d) => {
      listContainer.innerHTML += `
        <div class="instruction-row">
          <h4>${d.tradeName} <span style="font-size: 12px; color: #51607a; font-weight: 600;">(${d.genericName})</span></h4>
          <div class="instruction-inputs">
            <div style="flex: 1;">
              <label style="font-size: 12px; font-weight: 700; margin-bottom: 4px; display: block;">الكمية المطلوبة</label>
              <input type="number" id="qty_${d.id}" class="input" min="1" max="${d.stockQuantity}" required placeholder="مثال: 2">
            </div>
            <div style="flex: 3;">
              <label style="font-size: 12px; font-weight: 700; margin-bottom: 4px; display: block;">طريقة الاستخدام والتعليمات</label>
              <input type="text" id="inst_${d.id}" class="input" required placeholder="مثال: حبة واحدة كل 12 ساعة بعد الأكل">
            </div>
          </div>
        </div>
      `;
    });

    document.getElementById("instructionsModal").classList.add("show");
  };

  document
    .getElementById("prescriptionForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();
      const btnSubmit = document.getElementById("btn-submit-prescription");

      // تجميع البيانات
      const prescriptionItems = selectedDrugs.map((d) => ({
        drugCatalogId: d.id,
        quantity: parseInt(document.getElementById(`qty_${d.id}`).value, 10),
        instructions: document.getElementById(`inst_${d.id}`).value.trim(),
      }));

      const payload = {
        prescriptionItems: prescriptionItems,
        appointmentId: parseInt(appointmentId, 10),
      };

      btnSubmit.disabled = true;
      btnSubmit.textContent = "جاري الحفظ وإصدار الروشتة...";

      try {
        await apiRequest(`${API_BASE}/api/Prescription`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        showToast("تمت إضافة الروشتة بنجاح! جاري إعادتك للغرفة...");
        setTimeout(() => {
          window.location.href = `consultation.html?appointmentId=${appointmentId}`;
        }, 2000);
      } catch (err) {
        showToast(err.message, true);
        btnSubmit.disabled = false;
        btnSubmit.textContent = "تأكيد وإصدار الروشتة";
      }
    });

  // بدء العمليات
  loadDrugs(currentPage);
});
