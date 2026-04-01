/* js/manage-tests.js */
document.addEventListener("DOMContentLoaded", () => {
  if (window.AppAuth) window.AppAuth.initAuth();
  const API_BASE = "http://smarthospitalapi.somee.com";
  let categories = [];
  let activeCatId = null;
  let deleteTargetId = null;

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
    if (!resp.ok) {
      if (resp.status === 401) window.AppLogout?.logout();
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

  window.closeAllModals = () =>
    document
      .querySelectorAll(".modal-backdrop")
      .forEach((m) => m.classList.remove("show"));

  async function loadCatalog() {
    try {
      const response = await apiRequest(
        `${API_BASE}/api/TestCatalog?PageNumber=1&PageSize=50`,
      );
      categories = response?.data || [];
      document.getElementById("loading-overlay").style.display = "none";
      document.getElementById("catalog-content").style.display = "grid";

      renderSidebar();
      if (categories.length > 0) {
        selectCategory(activeCatId ? activeCatId : categories[0].id);
      }
    } catch (e) {
      showToast("فشل تحميل الكتالوج: " + e.message, true);
    }
  }

  function renderSidebar() {
    const container = document.getElementById("categories-list");
    container.innerHTML = "";
    categories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = `category-btn ${activeCatId === cat.id ? "active" : ""}`;
      btn.innerHTML = `${cat.name} <span class="badge">${cat.tests?.length || 0}</span>`;
      btn.onclick = () => selectCategory(cat.id);
      container.appendChild(btn);
    });
  }

  window.selectCategory = function (id) {
    activeCatId = id;
    renderSidebar();

    const cat = categories.find((c) => c.id === id);
    document.getElementById("current-category-title").textContent = cat
      ? `فحوصات: ${cat.name}`
      : "اختر قسماً";
    document.getElementById("btnAddTest").style.display = cat
      ? "block"
      : "none";
    renderTests(cat?.tests || []);
  };

  function renderTests(tests) {
    const grid = document.getElementById("tests-grid");
    grid.innerHTML = "";
    if (tests.length === 0) {
      grid.innerHTML =
        "<p style='color:#51607a'>لا توجد فحوصات. يمكنك إضافة فحص جديد.</p>";
      return;
    }

    tests.forEach((t) => {
      const card = document.createElement("div");
      card.className = "test-card";
      card.innerHTML = `
        <div>
          <h3 class="test-name">${t.name}</h3>
          <p class="test-desc">${t.description}</p>
          <div class="test-meta">
            <span dir="ltr">⏱️ ${t.duration}</span>
            <span style="color:var(--success)">💰 ${t.price} SDG</span>
          </div>
        </div>
        <div style="display:flex; gap:10px; margin-top:14px;">
          <button class="btn ghost" style="flex:1" onclick='openTestModal(${JSON.stringify(t).replace(/'/g, "&#39;")})'>تعديل</button>
          <button class="btn danger" style="flex:1" onclick="openDeleteTest(${t.id})">حذف</button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  window.openCategoryModal = () => {
    document.getElementById("cat-name").value = "";
    document.getElementById("categoryModal").classList.add("show");
  };

  document.getElementById("categoryForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnSaveCat");
    btn.disabled = true;
    try {
      await apiRequest(`${API_BASE}/api/TestCatalog/Category`, {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("cat-name").value,
        }),
      });
      showToast("تمت إضافة الفئة بنجاح");
      closeAllModals();
      loadCatalog();
    } catch (err) {
      showToast(err.message, true);
    }
    btn.disabled = false;
  };

  window.openTestModal = (test = null) => {
    document.getElementById("testModalTitle").textContent = test
      ? "تعديل الفحص"
      : "إضافة فحص جديد";
    document.getElementById("test-id").value = test ? test.id : 0;
    document.getElementById("test-catId").value = test
      ? test.testCategoryId
      : activeCatId;
    document.getElementById("test-name").value = test ? test.name : "";
    document.getElementById("test-desc").value = test ? test.description : "";
    document.getElementById("test-duration").value = test
      ? test.duration
      : "00:15:00";
    document.getElementById("test-price").value = test ? test.price : "";
    document.getElementById("testModal").classList.add("show");
  };

  document.getElementById("testForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnSaveTest");
    const id = parseInt(document.getElementById("test-id").value);

    // أخذ القيمة مباشرة من الحقل النصي
    let dur = document.getElementById("test-duration").value;

    // تأكيد الفورمات لو نقصت الثواني
    if (dur.split(":").length === 2) dur += ":00";

    const payload = {
      id: id,
      name: document.getElementById("test-name").value,
      description: document.getElementById("test-desc").value,
      duration: dur,
      price: parseFloat(document.getElementById("test-price").value),
      testCategoryId: parseInt(document.getElementById("test-catId").value),
    };

    btn.disabled = true;
    try {
      const method = id === 0 ? "POST" : "PUT";
      const url =
        id === 0
          ? `${API_BASE}/api/TestCatalog/Test`
          : `${API_BASE}/api/TestCatalog`;
      await apiRequest(url, { method: method, body: JSON.stringify(payload) });
      showToast(id === 0 ? "تمت إضافة الفحص" : "تم تعديل الفحص بنجاح");
      closeAllModals();
      loadCatalog();
    } catch (err) {
      showToast(err.message, true);
    }
    btn.disabled = false;
  };

  window.openDeleteTest = (id) => {
    deleteTargetId = id;
    document.getElementById("deleteTestModal").classList.add("show");
  };

  document.getElementById("btnConfirmDeleteTest").onclick = async () => {
    const btn = document.getElementById("btnConfirmDeleteTest");
    btn.disabled = true;
    try {
      await apiRequest(`${API_BASE}/api/TestCatalog/${deleteTargetId}`, {
        method: "DELETE",
      });
      showToast("تم الحذف بنجاح");
      closeAllModals();
      loadCatalog();
    } catch (err) {
      showToast(err.message, true);
    }
    btn.disabled = false;
  };

  loadCatalog();
});
