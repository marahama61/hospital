/* js/inventory.js */

document.addEventListener("DOMContentLoaded", () => {
  if (window.AppAuth && typeof window.AppAuth.initAuth === "function") {
    window.AppAuth.initAuth();
  }

  const API_BASE = "http://smarthospitalapi.somee.com";
  let allLoadedDrugs = [];
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
    document
      .querySelectorAll(".modal-backdrop")
      .forEach((m) => m.classList.remove("show"));
  };

  // إغلاق المودال عند الضغط بالخارج
  document.querySelectorAll(".modal-backdrop").forEach((m) =>
    m.addEventListener("click", (e) => {
      if (e.target === m) closeAllModals();
    }),
  );

  async function apiRequest(url, options = {}) {
    // استخدم authFetch إذا كانت متوفرة في المشروع
    const fetchFunc = window.authFetch || fetch;
    const resp = await fetchFunc(url, {
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
      grid.innerHTML = `<p style="color: #51607a; grid-column: 1 / -1;">لا توجد أدوية مطابقة.</p>`;
      return;
    }

    drugsList.forEach((drug) => {
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
          <button class="btn primary" onclick="openUpdateStockModal(${drug.id}, '${drug.tradeName}', ${drug.stockQuantity})">
            <i class="fa-solid fa-pen-to-square"></i> تحديث المخزون
          </button>
        </div>
      `;
    });
  }

  // البحث
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
      return (
        (d.tradeName || "").toLowerCase().includes(tradeQ) &&
        (d.genericName || "").toLowerCase().includes(genericQ)
      );
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

  // ===== إدارة تحديث المخزون =====
  window.openUpdateStockModal = function (drugId, tradeName, currentStock) {
    document.getElementById("stockDrugId").value = drugId;
    document.getElementById("stockDrugNameDisplay").textContent =
      `تحديث مخزون الدواء: ${tradeName}`;
    document.getElementById("newStockQuantity").value = currentStock;
    document.getElementById("updateStockModal").classList.add("show");
  };

  document
    .getElementById("updateStockForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();
      const btnSubmit = document.getElementById("btn-submit-stock");
      const drugId = document.getElementById("stockDrugId").value;
      const newQuantity = document.getElementById("newStockQuantity").value;

      btnSubmit.disabled = true;
      btnSubmit.textContent = "جاري التحديث...";

      try {
        await apiRequest(
          `${API_BASE}/api/Prescription/Update-stok/${drugId}/${newQuantity}`,
          { method: "PUT" },
        );
        showToast("تم تحديث المخزون بنجاح!");
        closeAllModals();
        loadDrugs(currentPage); // إعادة تحميل القائمة لتحديث الرقم
      } catch (err) {
        showToast(err.message, true);
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "حفظ التحديث";
      }
    });

  // ===== إدارة إضافة دواء جديد =====
  window.openAddDrugModal = function () {
    document.getElementById("addDrugForm").reset();
    document.getElementById("addDrugModal").classList.add("show");
  };

  document
    .getElementById("addDrugForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();
      const btnSubmit = document.getElementById("btn-submit-drug");

      const payload = {
        id: 0,
        tradeName: document.getElementById("addTradeName").value.trim(),
        genericName: document.getElementById("addGenericName").value.trim(),
        description: document.getElementById("addDescription").value.trim(),
        manufacturer: document.getElementById("addManufacturer").value.trim(),
        stockQuantity: parseInt(document.getElementById("addStock").value, 10),
        expiryDate: document.getElementById("addExpiry").value,
        price: parseFloat(document.getElementById("addPrice").value),
      };

      btnSubmit.disabled = true;
      btnSubmit.textContent = "جاري الإضافة...";

      try {
        await apiRequest(`${API_BASE}/api/Prescription/Add-Drug`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("تم إضافة الدواء للكتالوج بنجاح!");
        closeAllModals();
        loadDrugs(1); // العودة للصفحة الأولى لمشاهدة الدواء الجديد غالباً
      } catch (err) {
        showToast(err.message, true);
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "إضافة الدواء";
      }
    });

  // بدء العمليات
  loadDrugs(currentPage);
});
