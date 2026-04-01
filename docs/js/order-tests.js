/* js/order-tests.js */

document.addEventListener("DOMContentLoaded", () => {
  if (window.AppAuth && typeof window.AppAuth.initAuth === "function") {
    window.AppAuth.initAuth();
  }

  const API_BASE = "http://smarthospitalapi.somee.com";
  let currentAppointmentId = null;
  let allCategories = [];
  let activeCategoryId = null;

  // ===== Helpers =====
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
    if (!resp.ok) throw new Error(data?.message || `خطأ: ${resp.status}`);
    return data;
  }

  // نظام الـ Toast السلس
  window.showToast = function (message, isError = false) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${isError ? "error" : ""}`;
    toast.innerHTML = `<span>${isError ? "❌" : "✅"}</span> ${message}`;

    container.appendChild(toast);

    // إخفاء الـ Toast بعد 3 ثواني
    setTimeout(() => {
      toast.style.animation = "fadeOut 0.3s forwards";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  // ===== Initialization =====
  async function initOrderTests() {
    const urlParams = new URLSearchParams(window.location.search);
    currentAppointmentId = urlParams.get("appointmentId");

    if (!currentAppointmentId) {
      alert("رقم الموعد غير متوفر! سيتم إعادتك للوحة.");
      window.location.href = "doctor-dashboard.html";
      return;
    }

    // إعداد زر الرجوع ليحتفظ برقم الموعد
    const backBtn = document.getElementById("backToConsultation");
    if (backBtn) {
      backBtn.href = `consultation.html?appointmentId=${currentAppointmentId}`;
    }

    try {
      // الريكويست الأول يجلب كل الأقسام وبداخلها كل الفحوصات (مما يغنينا عن ريكويستات إضافية)
      const response = await apiRequest(
        `${API_BASE}/api/TestCatalog?PageNumber=1&PageSize=50`,
      );
      allCategories = response?.data || [];

      document.getElementById("loading-overlay").style.display = "none";
      document.getElementById("catalog-content").style.display = "grid";

      renderCategoriesSidebar();

      // تحديد أول قسم كقسم نشط افتراضياً
      if (allCategories.length > 0) {
        selectCategory(allCategories[0].id);
      } else {
        document.getElementById("tests-grid").innerHTML =
          "<p>لا توجد فحوصات متاحة حالياً.</p>";
      }
    } catch (err) {
      document.getElementById("loading-overlay").innerHTML =
        `<span style="color:#dc3545;">تعذر تحميل الدليل: ${err.message}</span>
         <br><br><a href="consultation.html?appointmentId=${currentAppointmentId}" class="btn primary">تراجع</a>`;
    }
  }

  // ===== Rendering Categories =====
  function renderCategoriesSidebar() {
    const container = document.getElementById("categories-list");
    container.innerHTML = "";

    allCategories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = "category-btn";
      btn.id = `cat-btn-${cat.id}`;
      // عرض اسم القسم مع عدد الفحوصات جواه
      btn.innerHTML = `${cat.name} <span style="font-size:11px; background:#e9eefc; padding:2px 6px; border-radius:4px;">${cat.tests ? cat.tests.length : 0}</span>`;

      btn.onclick = () => selectCategory(cat.id);
      container.appendChild(btn);
    });
  }

  // ===== Selecting a Category =====
  window.selectCategory = function (categoryId) {
    activeCategoryId = categoryId;

    // تحديث الشكل (Active State)
    document
      .querySelectorAll(".category-btn")
      .forEach((btn) => btn.classList.remove("active"));
    const activeBtn = document.getElementById(`cat-btn-${categoryId}`);
    if (activeBtn) activeBtn.classList.add("active");

    const category = allCategories.find((c) => c.id === categoryId);
    if (!category) return;

    document.getElementById("current-category-title").textContent =
      `فحوصات: ${category.name}`;
    document.getElementById("search-tests").value = ""; // تصفير البحث عند تغيير القسم
    renderTests(category.tests || []);
  };

  // ===== Rendering Tests =====
  function renderTests(tests) {
    const grid = document.getElementById("tests-grid");
    grid.innerHTML = "";

    if (tests.length === 0) {
      grid.innerHTML =
        "<p style='grid-column: 1/-1; color: #51607a;'>لا توجد فحوصات في هذا القسم.</p>";
      return;
    }

    const fragment = document.createDocumentFragment();

    tests.forEach((test) => {
      const card = document.createElement("div");
      card.className = "test-card";

      // تنسيق السعر
      const priceFormatted = new Intl.NumberFormat("ar-EG", {
        style: "currency",
        currency: "SDG",
      }).format(test.price);

      // تنسيق المدة الزمنية (من 00:30:00 إلى 30 دقيقة مثلاً)
      let durationStr = test.duration;
      if (durationStr) {
        const parts = durationStr.split(":");
        if (parts.length >= 2) {
          const hrs = parseInt(parts[0]);
          const mins = parseInt(parts[1]);
          if (hrs > 0) durationStr = `${hrs} ساعة و ${mins} دقيقة`;
          else durationStr = `${mins} دقيقة`;
        }
      }

      card.innerHTML = `
        <div>
          <h3 class="test-name">${test.name}</h3>
          <p class="test-desc">${test.description || "لا يوجد وصف."}</p>
          <div class="test-meta">
            <span>⏱️ المدة: ${durationStr || "-"}</span>
            <span class="test-price">💰 ${priceFormatted}</span>
          </div>
        </div>
        <button class="btn primary" onclick="orderSpecificTest(${test.id}, this)">إضافة الفحص</button>
      `;
      fragment.appendChild(card);
    });

    grid.appendChild(fragment);
  }

  // ===== Search Functionality =====
  document.getElementById("search-tests")?.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase().trim();
    const category = allCategories.find((c) => c.id === activeCategoryId);
    if (!category || !category.tests) return;

    const filteredTests = category.tests.filter(
      (test) =>
        test.name.toLowerCase().includes(term) ||
        (test.description && test.description.toLowerCase().includes(term)),
    );

    renderTests(filteredTests);
  });

  // ===== Order Test (POST) =====
  window.orderSpecificTest = async function (testId, btnElement) {
    btnElement.disabled = true;
    btnElement.textContent = "جاري الإضافة...";

    try {
      await apiRequest(`${API_BASE}/api/TestOrder/Order`, {
        method: "POST",
        body: JSON.stringify({
          id: 0, // كما طلبت، الـ ID غير مهم في الإرسال
          testCatalogId: parseInt(testId),
          appointmentId: parseInt(currentAppointmentId),
        }),
      });

      // إظهار الإشعار الأخضر
      showToast("تمت إضافة الفحص للمريض بنجاح!");

      // تغيير شكل الزر ليدل على النجاح
      btnElement.textContent = "تم الطلب ✅";
      btnElement.classList.replace("primary", "success");

      // يمكن إعادة الزر لحالته بعد فترة إذا أردت، أو تركه كدلالة على أنه طلبه بالفعل
      setTimeout(() => {
        btnElement.disabled = false;
        btnElement.textContent = "إضافة فحص آخر";
        btnElement.classList.replace("success", "primary");
      }, 4000);
    } catch (err) {
      showToast(err.message, true);
      btnElement.disabled = false;
      btnElement.textContent = "إضافة الفحص";
    }
  };

  // Start
  initOrderTests();
});
