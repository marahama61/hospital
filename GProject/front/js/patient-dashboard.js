/* js/patient-dashboard.js */

document.addEventListener("DOMContentLoaded", () => {
  if (window.AppAuth && typeof window.AppAuth.initAuth === "function") {
    window.AppAuth.initAuth();
  }

  const API_BASE = "http://smarthospitalapi.somee.com";
  const PAYMENT_API_URL = `${API_BASE}/api/Payment`;

  /* States */
  let currentAppointmentStatus = "upcoming";
  let currentAppointmentPage = 1;
  const appointmentPageSize = 20;
  let appointmentTotalCount = null;
  let appointmentTotalPages = null;
  let currentMedPage = 1;
  const medPageSize = 20;

  let currentTestPage = 1;
  const testPageSize = 10;

  let currentBillPage = 1;
  const billPageSize = 10;

  let currentPaymentPage = 1;
  const paymentPageSize = 10;
  let allPatientPayments = [];

  const paymentState = {
    invoice: null,
    bankProviders: [],
    bankProvidersLoading: false,
    bankProvidersLoaded: false,
    selectedBankProviderId: null,
    selectedBankProviderName: "",
    bankCards: [],
    bankCardsLoading: false,
    selectedBankCardId: null,
    submitting: false,
  };

  const bookingState = {
    doctor: null,
    schedules: [],
    availableDates: [],
    selectedDate: null,
    selectedTime: null,
    nearest: true,
    submitting: false,
    bookingResult: null,
    paymentSubmitting: false,
    bankProviders: [],
    bankProvidersLoading: false,
    bankProvidersLoaded: false,
    selectedBankProviderId: null,
    selectedBankProviderName: "",
    bankCards: [],
    bankCardsLoading: false,
    selectedBankCardId: null,
  };

  let bookingBackdrop = null;
  let bookingContent = null;
  let bookingModalBound = false;

  const BANK_LOGOS = {
    "bank of khartoum": "images/Bankklogo.png",
    faisal: "images/faisal.jpg",
    "faisal islamic bank": "images/faisal.jpg",
    omdurman: "images/Omdurman.jpg",
    "omdurman national bank": "images/Omdurman.jpg",
  };

  const scheduleCache = new Map();
  const bankCardsCache = new Map();

  /* ===== SUDAN TIME HELPER ===== */
  function getSudanTime() {
    const now = new Date();
    return new Date(
      now.toLocaleString("en-US", { timeZone: "Africa/Khartoum" }),
    );
  }

  /* ===== CLOCK ===== */
  function updateClock() {
    const el = document.getElementById("clock");
    if (!el) return;
    const now = getSudanTime();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    el.textContent = hh + ":" + mm;
  }
  setInterval(updateClock, 1000);
  updateClock();

  /* ===== KPI animation ===== */
  function animateCount(id, target, duration = 1200) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = parseInt(el.textContent) || 0;
    const range = target - start;
    if (range === 0) {
      el.textContent = target;
      return;
    }

    let startTime = null;
    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      el.textContent = Math.floor(progress * range + start);
      if (progress < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  /* ===== DEFAULT DATA ===== */
  window.patientData = window.patientData || {
    appointments: [],
    tests: [],
    meds: [],
    invoices: [],
    payments: [],
  };

  /* ===== Helpers ===== */
  window.showToast = function (msg, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    void toast.offsetWidth; // trigger reflow
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  function toDateInputValue(dateValue) {
    if (!dateValue) return "";
    if (typeof dateValue === "string") {
      if (dateValue.includes("T")) return dateValue.split("T")[0];
      if (dateValue.length >= 10) return dateValue.slice(0, 10);
    }
    const d = new Date(dateValue);
    if (isNaN(d)) return "";
    return d.toISOString().split("T")[0];
  }

  function normalizeApiList(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.Items)) return payload.Items;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.Data)) return payload.Data;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.Results)) return payload.Results;
    if (Array.isArray(payload.value)) return payload.value;
    if (Array.isArray(payload.Value)) return payload.Value;
    return [];
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"'`=\/]/g, (s) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "/": "&#x2F;",
        "`": "&#x60;",
        "=": "&#x3D;",
      }[s];
    });
  }

  async function apiRequest(url, options = {}) {
    const client = window.authFetch || window.fetch.bind(window);
    const resp = await client(url, options);
    const raw = await resp.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }
    if (!resp.ok) {
      const message =
        (data &&
          typeof data === "object" &&
          (data.message || data.errorMessage)) ||
        (typeof data === "string" && data.trim()) ||
        `فشل الطلب (${resp.status})`;
      throw new Error(message);
    }
    return data;
  }

  async function apiGet(url) {
    return apiRequest(url, { method: "GET", headers: { Accept: "*/*" } });
  }

  async function apiPost(url, payload) {
    return apiRequest(url, {
      method: "POST",
      headers: { Accept: "*/*", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  /* ===== Schedule Helpers ===== */
  function formatTimeSpan(span) {
    if (span == null) return "";
    const s = String(span).trim();
    if (!s) return "";
    if (s.length >= 5) return s.slice(0, 5);
    return s;
  }

  function dayIndexFromValue(dayValue) {
    if (dayValue == null) return null;
    if (typeof dayValue === "number" && Number.isFinite(dayValue))
      return dayValue;
    const raw = String(dayValue).trim();
    if (/^\d+$/.test(raw)) return Number(raw);
    const key = raw.toLowerCase();
    const map = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
      الأحد: 0,
      الاثنين: 1,
      الثلاثاء: 2,
      الأربعاء: 3,
      الخميس: 4,
      الجمعة: 5,
      السبت: 6,
    };
    return map[key] ?? null;
  }

  function dayLabelFromIndex(index) {
    const labels = [
      "الأحد",
      "الاثنين",
      "الثلاثاء",
      "الأربعاء",
      "الخميس",
      "الجمعة",
      "السبت",
    ];
    return labels[index] ?? "";
  }

  function dayLabelFromValue(value) {
    const index = dayIndexFromValue(value);
    return index === null ? String(value ?? "") : dayLabelFromIndex(index);
  }

  function dateKeyLocal(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function addDays(dateObj, days) {
    const d = new Date(dateObj);
    d.setDate(d.getDate() + days);
    return d;
  }

  function formatArabicDate(dateObj) {
    try {
      return new Intl.DateTimeFormat("ar-EG", {
        timeZone: "Africa/Khartoum",
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(dateObj);
    } catch {
      return dateKeyLocal(dateObj);
    }
  }

  function combineDateAndTime(dateObj, timeStr) {
    const [hh, mm] = String(timeStr).split(":").map(Number);
    const d = new Date(dateObj);
    d.setHours(hh || 0, mm || 0, 0, 0);
    return d;
  }

  function localDateTimeValue(dateKey, timeHHmm) {
    return `${dateKey}T${timeHHmm}:00`;
  }

  function normalizeSchedules(payload) {
    const list = normalizeApiList(payload);
    return list
      .map((item) => {
        const rawDay = item.dayOfWeek ?? item.DayOfWeek;
        const rawStart = item.startTime ?? item.StartTime;
        const rawEnd = item.endTime ?? item.EndTime;
        return {
          id: item.id ?? item.Id,
          dayOfWeek: rawDay,
          dayIndex: dayIndexFromValue(rawDay),
          dayLabel: dayLabelFromValue(rawDay),
          startTime: formatTimeSpan(rawStart),
          endTime: formatTimeSpan(rawEnd),
        };
      })
      .filter((x) => x.dayIndex !== null && x.startTime && x.endTime);
  }

  async function loadDoctorSchedules(doctorId) {
    if (scheduleCache.has(doctorId)) return scheduleCache.get(doctorId);
    const promise = apiGet(`${API_BASE}/api/DoctorSchedule/${doctorId}`)
      .then((data) => normalizeSchedules(data))
      .catch((err) => {
        scheduleCache.delete(doctorId);
        throw err;
      });
    scheduleCache.set(doctorId, promise);
    return promise;
  }

  /* --- Enums Mappers --- */
  function translateInvoiceStatus(status) {
    const s = String(status || "")
      .toLowerCase()
      .trim();
    if (s === "draft" || s === "0") return "مسودة";
    if (s === "issued" || s === "1") return "مصدرة (قيد الانتظار)";
    if (s === "partiallypaid" || s === "2") return "مدفوعة جزئياً";
    if (s === "paid" || s === "3") return "مدفوعة بالكامل";
    if (s === "cancelled" || s === "4") return "ملغاة";
    return status || "-";
  }

  function getInvoiceStatusClass(status) {
    const s = String(status || "")
      .toLowerCase()
      .trim();
    if (s === "paid" || s === "3") return "status-paid";
    if (s === "cancelled" || s === "4") return "status-unpaid";
    return "status-pending";
  }

  function appointmentStatusText(status) {
    const s = String(status || "")
      .toLowerCase()
      .trim();
    if (s === "pending") return "قيد الانتظار";
    if (s === "scheduled") return "مجدول";
    if (s === "completed") return "مكتملة";
    if (s === "cancelled" || s === "canceled") return "ملغاة";
    return status || "-";
  }

  function appointmentStatusClass(status) {
    const s = String(status || "")
      .toLowerCase()
      .trim();
    if (s === "pending") return "pending";
    if (s === "scheduled") return "scheduled";
    if (s === "completed") return "completed";
    if (s === "cancelled" || s === "canceled") return "canceled";
    return "";
  }

  function formatAppointmentDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (isNaN(date)) return String(value);
    try {
      return new Intl.DateTimeFormat("ar-EG", {
        timeZone: "Africa/Khartoum",
        weekday: "long",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch {
      return date.toLocaleString("en-US", { timeZone: "Africa/Khartoum" });
    }
  }

  function getAppointmentEndpoint(status, page) {
    if (status === "completed") {
      return `${API_BASE}/api/Appointment/patient/completed?PageNumber=${page}&PageSize=${appointmentPageSize}`;
    }
    if (status === "canceled") {
      return `${API_BASE}/api/Appointment/patient/canceled?PageNumber=${page}&PageSize=${appointmentPageSize}`;
    }
    return `${API_BASE}/api/Appointment/patient?PageNumber=${page}&PageSize=${appointmentPageSize}`;
  }

  /* ===== TAB logic ===== */
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.getAttribute("data-tab");
      showTab(target);

      if (target === "bills") {
        initBillsAndPayments();
      } else if (target === "tests") {
        loadTests();
      } else if (target === "meds") {
        loadMeds();
      }
    });
  });

  function showTab(name) {
    document.querySelectorAll("#patient-content > .tab-pane").forEach((el) => {
      el.style.display = el.id === "tab-" + name ? "block" : "none";
    });
  }

  /* ===== APPOINTMENTS ===== */
  const statusFilters = document.querySelectorAll(".status-filter");
  statusFilters.forEach((btn) => {
    btn.addEventListener("click", () => {
      statusFilters.forEach((f) => f.classList.remove("active"));
      btn.classList.add("active");
      currentAppointmentStatus = btn.getAttribute("data-status");
      currentAppointmentPage = 1;
      loadAppointments(currentAppointmentStatus, currentAppointmentPage);
    });
  });

  async function loadAppointments(
    status = currentAppointmentStatus,
    page = currentAppointmentPage,
  ) {
    const container = document.getElementById("appointments-list");
    const pager = document.getElementById("appointments-pager");
    if (!container || !pager) return;

    container.innerHTML = '<div class="panel">جاري تحميل المواعيد...</div>';
    pager.innerHTML = "";

    try {
      const client = window.authFetch || window.fetch.bind(window);
      const resp = await client(getAppointmentEndpoint(status, page), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const data = await resp.json().catch(() => null);

      if (!resp.ok) throw new Error(data?.message || "فشل تحميل المواعيد");

      const list = normalizeApiList(data);
      let filtered = list;
      if (status === "upcoming") {
        filtered = list.filter((a) => {
          const s = String(a.status || "")
            .toLowerCase()
            .trim();
          return s === "pending" || s === "scheduled";
        });
      } else if (status === "completed") {
        filtered = list.filter(
          (a) =>
            String(a.status || "")
              .toLowerCase()
              .trim() === "completed",
        );
      } else if (status === "canceled") {
        filtered = list.filter((a) => {
          const s = String(a.status || "")
            .toLowerCase()
            .trim();
          return s === "canceled" || s === "cancelled";
        });
      }

      window.patientData.appointments = filtered;
      appointmentTotalCount =
        data?.totalCount ??
        data?.TotalCount ??
        data?.pagination?.totalCount ??
        data?.count ??
        null;
      appointmentTotalPages =
        data?.totalPages ??
        data?.TotalPages ??
        data?.pagination?.totalPages ??
        (typeof appointmentTotalCount === "number"
          ? Math.max(1, Math.ceil(appointmentTotalCount / appointmentPageSize))
          : null);

      const todayStr = getSudanTime().toDateString();
      const todayCount = list.filter((a) => {
        const d = new Date(a.appointmentDateTime || a.AppointmentDateTime);
        if (isNaN(d)) return false;
        const sudanD = new Date(
          d.toLocaleString("en-US", { timeZone: "Africa/Khartoum" }),
        );
        const s = String(a.status || "")
          .toLowerCase()
          .trim();
        const isPendingOrScheduled = s === "pending" || s === "scheduled";
        return sudanD.toDateString() === todayStr && isPendingOrScheduled;
      }).length;

      animateCount("kpi-appointments", todayCount);
      renderAppointments(filtered, status);
      renderAppointmentPager(page, appointmentTotalPages, filtered.length);
    } catch (err) {
      console.error(err);
      container.innerHTML = `<div class="panel">تعذر تحميل المواعيد: ${err.message}</div>`;
      pager.innerHTML = "";
    }
  }

  function renderAppointments(list, status) {
    const container = document.getElementById("appointments-list");
    if (!container) return;
    container.innerHTML = "";

    if (!list || list.length === 0) {
      container.innerHTML =
        '<div class="panel">لا توجد مواعيد في هذه الحالة.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    list.forEach((app) => {
      const div = document.createElement("div");
      div.className = "appointment-card";

      const statusClass = appointmentStatusClass(app.status);
      const statusLabel = appointmentStatusText(app.status);
      const statusValue = String(app.status || "")
        .toLowerCase()
        .trim();

      div.innerHTML = `
        <div class="topline">
          <div class="meta">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
              <span class="appointment-badge ${statusClass}">${statusLabel}</span>
              <strong>${formatAppointmentDateTime(app.appointmentDateTime)}</strong>
            </div>
            <div style="font-size:14px;color:#51607a;margin-top:4px">
              ${escapeHtml(app.doctorName || "-")} — ${escapeHtml(app.doctorSpecialization || "-")}
            </div>
            <div style="font-size:13px;color:#33415a;margin-top:6px">
              المريض: ${escapeHtml(app.patientName || "-")}
            </div>
          </div>
        </div>
        <div class="appointment-actions" style="margin-top:12px; border-top: 1px solid #f0f4fb; padding-top: 12px;">
          <button class="btn small" type="button" onclick="showAppointmentDetails(${app.id})">تفاصيل</button>
          ${
            status === "upcoming" && statusValue === "pending"
              ? `
            <div style="display:flex; align-items:center; gap:8px;">
               <span style="font-size: 12px; color: #b00020; font-weight: bold; background: #ffecec; padding: 4px 8px; border-radius: 4px; border: 1px solid #f1b6b6;">يجب سداد الفاتورة لتأكيد الموعد</span>
               <button class="btn small" type="button" onclick="goToBillsTab()">دفع الفاتورة</button>
            </div>`
              : ""
          }
          ${
            status === "upcoming" && statusValue === "scheduled"
              ? `
            <button class="btn small danger" type="button" onclick="cancelAppointment(${app.id})">إلغاء الموعد</button>`
              : ""
          }
        </div>
      `;
      fragment.appendChild(div);
    });
    container.appendChild(fragment);
  }

  function renderAppointmentPager(page, totalPages, currentCount) {
    const pager = document.getElementById("appointments-pager");
    if (!pager) return;

    const hasPrev = page > 1;
    const hasNext = totalPages
      ? page < totalPages
      : currentCount >= appointmentPageSize;

    pager.innerHTML = `
      <div class="pager-info">الصفحة ${page}${totalPages ? ` من ${totalPages}` : ""} ${appointmentTotalCount !== null ? `— إجمالي النتائج: ${appointmentTotalCount}` : ""}</div>
      <div class="pager-actions">
        <button type="button" class="btn ghost" id="appointmentsPrevBtn" ${hasPrev ? "" : "disabled"}>السابق</button>
        <button type="button" class="btn ghost" id="appointmentsNextBtn" ${hasNext ? "" : "disabled"}>التالي</button>
      </div>
    `;

    document
      .getElementById("appointmentsPrevBtn")
      ?.addEventListener("click", () => {
        if (currentAppointmentPage > 1) {
          currentAppointmentPage--;
          loadAppointments(currentAppointmentStatus, currentAppointmentPage);
        }
      });

    document
      .getElementById("appointmentsNextBtn")
      ?.addEventListener("click", () => {
        if (
          appointmentTotalPages &&
          currentAppointmentPage < appointmentTotalPages
        ) {
          currentAppointmentPage++;
          loadAppointments(currentAppointmentStatus, currentAppointmentPage);
        } else if (
          !appointmentTotalPages &&
          currentCount >= appointmentPageSize
        ) {
          currentAppointmentPage++;
          loadAppointments(currentAppointmentStatus, currentAppointmentPage);
        }
      });
  }

  window.showAppointmentDetails = function (id) {
    const app = (window.patientData.appointments || []).find(
      (a) => a.id === id,
    );
    if (!app) return;
    const html = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:800;font-size:18px">تفاصيل الموعد</div>
        <button type="button" class="btn ghost" id="closeModalBtn">إغلاق</button>
      </div>
      <div style="margin-top:12px">
        <p><strong>الحالة:</strong> ${appointmentStatusText(app.status)}</p>
        <p><strong>التاريخ والوقت:</strong> ${formatAppointmentDateTime(app.appointmentDateTime)}</p>
        <p><strong>الطبيب:</strong> ${escapeHtml(app.doctorName || "-")}</p>
        <p><strong>التخصص:</strong> ${escapeHtml(app.doctorSpecialization || "-")}</p>
        <p><strong>المريض:</strong> ${escapeHtml(app.patientName || "-")}</p>
      </div>
    `;
    openModal(html);
    document
      .getElementById("closeModalBtn")
      .addEventListener("click", closeModal);
  };

  window.goToBillsTab = function () {
    const billsTab = document.querySelector('.tab[data-tab="bills"]');
    if (billsTab) billsTab.click();
  };

  window.cancelAppointment = function (id) {
    const html = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:800;font-size:18px;color:#b00020">إلغاء الموعد</div>
        <button type="button" class="btn ghost" id="closeCancelModal">إغلاق</button>
      </div>
      <div style="margin-top:12px">
        <p style="font-size:15px; color:#33415a;">هل أنت متأكد من أنك تريد إلغاء الموعد رقم <strong>${id}</strong>؟</p>
        <div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end">
          <button type="button" class="btn ghost" id="btnCancelDismiss">تراجع</button>
          <button type="button" class="btn danger" id="btnConfirmCancel">نعم، إلغاء الموعد</button>
        </div>
      </div>
    `;
    openModal(html);

    document
      .getElementById("closeCancelModal")
      .addEventListener("click", closeModal);
    document
      .getElementById("btnCancelDismiss")
      .addEventListener("click", closeModal);
    document
      .getElementById("btnConfirmCancel")
      .addEventListener("click", async () => {
        const btn = document.getElementById("btnConfirmCancel");
        btn.disabled = true;
        btn.textContent = "جاري الإلغاء...";

        try {
          const resp = await window.authFetch(
            `${API_BASE}/api/Appointment/cancel/${id}`,
            {
              method: "PUT",
              headers: { Accept: "*/*" },
            },
          );

          if (resp.ok) {
            window.showToast("تم إلغاء الموعد بنجاح.", "success");
            setTimeout(() => {
              closeModal();
              loadAppointments(
                currentAppointmentStatus,
                currentAppointmentPage,
              );
            }, 1500);
          } else {
            const data = await resp.json().catch(() => null);
            window.showToast(
              data?.message || "فشل إلغاء الموعد. تأكد من إمكانية الإلغاء.",
              "error",
            );
            btn.disabled = false;
            btn.textContent = "نعم، إلغاء الموعد";
          }
        } catch (err) {
          window.showToast("تعذر الاتصال بالسيرفر لإلغاء الموعد.", "error");
          btn.disabled = false;
          btn.textContent = "نعم، إلغاء الموعد";
        }
      });
  };

  /* ===== TESTS LOGIC ===== */
  async function loadTests(page = currentTestPage) {
    const container = document.getElementById("tests-list");
    const pager = document.getElementById("tests-pager");
    if (!container) return;

    container.innerHTML =
      '<div class="panel" style="text-align:center;">جاري تحميل الفحوصات...</div>';
    if (pager) pager.innerHTML = "";

    try {
      const resp = await window.authFetch(
        `${API_BASE}/api/TestOrder/Patient?PageNumber=${page}&PageSize=${testPageSize}`,
      );
      const data = await resp.json();
      const orders = data.data || normalizeApiList(data);

      const totalCount = data.totalCount || data.TotalCount || 0;
      const totalPages = Math.ceil(totalCount / testPageSize);

      if (!orders || orders.length === 0) {
        container.innerHTML =
          '<div class="panel" style="text-align:center;">لا توجد فحوصات مسجلة.</div>';
        return;
      }

      const detailedOrders = await Promise.all(
        orders.map(async (o) => {
          try {
            const catResp = await window.authFetch(
              `${API_BASE}/api/TestCatalog/Test/${o.testCatalogId}`,
            );
            const catData = await catResp.json();
            return { ...o, catalog: catData };
          } catch (e) {
            return { ...o, catalog: null };
          }
        }),
      );

      renderTestsList(detailedOrders);
      renderTestPager(page, totalPages, orders.length);
    } catch (err) {
      container.innerHTML = `<div class="panel" style="color:var(--danger); text-align:center;">تعذر تحميل الفحوصات: ${err.message}</div>`;
    }
  }

  function renderTestsList(list) {
    const container = document.getElementById("tests-list");
    container.innerHTML = "";

    const fragment = document.createDocumentFragment();
    list.forEach((item) => {
      const div = document.createElement("div");
      div.className = "appointment-card";

      const dateStr = formatAppointmentDateTime(
        item.orderedOn || item.OrderedOn,
      );
      const name = item.catalog?.name || item.catalog?.Name || "فحص غير معروف";
      const desc =
        item.catalog?.description || item.catalog?.Description || "-";
      const duration = item.catalog?.duration || item.catalog?.Duration || "-";

      div.innerHTML = `
        <div class="topline" style="align-items: center;">
          <div class="meta">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
                <span class="appointment-badge completed" style="background:var(--accent); color:#fff; border:none;">طلب فحص #${item.id}</span>
                <strong>${dateStr}</strong>
            </div>
            <div style="font-size:16px;font-weight:700;color:var(--primary);margin-top:4px">
                ${escapeHtml(name)}
            </div>
            <div style="font-size:13px;color:#51607a;margin-top:6px;line-height:1.4;">
                ${escapeHtml(desc)}<br/>
                <span style="display:inline-block;margin-top:4px; font-weight:600;">المدة المتوقعة: <span dir="ltr">${escapeHtml(duration)}</span></span>
            </div>
          </div>
        </div>
        <div class="appointment-actions" style="margin-top:12px; border-top: 1px solid #f0f4fb; padding-top: 12px;">
          <button class="btn small" type="button" onclick="viewTestResult(${item.id})">عرض النتيجة</button>
        </div>
      `;
      fragment.appendChild(div);
    });
    container.appendChild(fragment);
  }

  function renderTestPager(page, totalPages, currentCount) {
    const pager = document.getElementById("tests-pager");
    if (!pager) return;

    const hasPrev = page > 1;
    const hasNext = totalPages
      ? page < totalPages
      : currentCount >= testPageSize;

    pager.innerHTML = `
      <div class="pager-info">الصفحة ${page}${totalPages ? ` من ${totalPages}` : ""}</div>
      <div class="pager-actions">
        <button type="button" class="btn ghost" id="testsPrevBtn" ${hasPrev ? "" : "disabled"}>السابق</button>
        <button type="button" class="btn ghost" id="testsNextBtn" ${hasNext ? "" : "disabled"}>التالي</button>
      </div>
    `;

    document.getElementById("testsPrevBtn")?.addEventListener("click", () => {
      if (currentTestPage > 1) {
        currentTestPage--;
        loadTests(currentTestPage);
      }
    });
    document.getElementById("testsNextBtn")?.addEventListener("click", () => {
      if (totalPages && currentTestPage < totalPages) {
        currentTestPage++;
        loadTests(currentTestPage);
      } else if (!totalPages && currentCount >= testPageSize) {
        currentTestPage++;
        loadTests(currentTestPage);
      }
    });
  }

  window.viewTestResult = async function (orderId) {
    try {
      const resp = await window.authFetch(
        `${API_BASE}/api/TestOrder/Result/Order/${orderId}`,
      );
      if (resp.status === 404) {
        window.showToast("لم يتم رفع النتيجة بعد.", "error");
        return;
      }
      if (!resp.ok) {
        window.showToast("حدث خطأ أثناء جلب النتيجة.", "error");
        return;
      }
      const result = await resp.json();

      let resultHtml = "";
      if (result.resultType === "Numeric") {
        resultHtml = `
          <div style="text-align:center; padding: 20px; background: #f8fafc; border-radius: 8px;">
            <div style="font-size: 36px; font-weight: bold; color: var(--primary);">${result.numericValue}</div>
            <div style="font-size: 15px; font-weight: 700; color: #51607a; margin-top: 8px;">الوحدة: <span dir="ltr">${result.unit || "-"}</span></div>
          </div>
        `;
      } else if (result.resultType === "Text") {
        resultHtml = `
          <div style="padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #eef3fb; white-space: pre-wrap; font-size: 15px; color: var(--text);">
            ${escapeHtml(result.textValue)}
          </div>
        `;
      } else if (result.resultType === "Image") {
        const imgUrl = result.fileUrl.startsWith("http")
          ? result.fileUrl
          : `${API_BASE}${result.fileUrl}`;
        resultHtml = `
          <div style="text-align:center;">
            <img src="${imgUrl}" alt="نتيجة الفحص" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
          </div>
        `;
      } else if (result.resultType === "File") {
        const fileUrl = result.fileUrl.startsWith("http")
          ? result.fileUrl
          : `${API_BASE}${result.fileUrl}`;
        resultHtml = `
          <div style="text-align:center; padding: 30px; background: #f8fafc; border-radius: 8px; border: 1px solid #eef3fb;">
            <div style="font-size: 48px; margin-bottom: 16px;">📄</div>
            <a href="${fileUrl}" target="_blank" class="btn" style="text-decoration:none; display: inline-block;">تحميل ملف النتيجة</a>
          </div>
        `;
      }

      const html = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:800;font-size:18px">نتيجة الفحص طلب رقم #${orderId}</div>
          <button type="button" class="btn ghost" id="closeResultModal">إغلاق</button>
        </div>
        <div style="margin-top:16px;">
          <div style="font-size:13px; color:#51607a; margin-bottom: 16px;">تاريخ رفع النتيجة: <span dir="ltr">${formatAppointmentDateTime(result.uploadedAt)}</span></div>
          ${resultHtml}
        </div>
      `;
      openModal(html);
      document
        .getElementById("closeResultModal")
        .addEventListener("click", closeModal);
    } catch (err) {
      window.showToast("تعذر الاتصال بالخادم لجلب النتيجة.", "error");
      console.error(err);
    }
  };

  /* ===== MEDS LOGIC ===== */
  async function loadMeds(page = currentMedPage) {
    const container = document.getElementById("meds-list");
    const pager = document.getElementById("meds-pager");
    if (!container) return;

    container.innerHTML =
      '<div class="panel" style="text-align:center;">جاري تحميل الوصفات الطبية...</div>';
    if (pager) pager.innerHTML = "";

    try {
      const resp = await window.authFetch(
        `${API_BASE}/api/Prescription/patient?PageNumber=${page}&PageSize=${medPageSize}`,
      );
      const data = await resp.json();
      const prescriptions = data.data || normalizeApiList(data);

      const totalCount = data.totalCount || data.TotalCount || 0;
      const totalPages = Math.ceil(totalCount / medPageSize);

      if (!prescriptions || prescriptions.length === 0) {
        container.innerHTML =
          '<div class="panel" style="text-align:center;">لا توجد وصفات طبية مسجلة.</div>';
        return;
      }

      const detailedPrescriptions = await Promise.all(
        prescriptions.map(async (p) => {
          if (p.prescriptionItems && p.prescriptionItems.length > 0) {
            const detailedItems = await Promise.all(
              p.prescriptionItems.map(async (item) => {
                try {
                  const drugResp = await window.authFetch(
                    `${API_BASE}/api/Prescription/Drug/${item.drugCatalogId}`,
                  );
                  if (drugResp.ok) {
                    const drugData = await drugResp.json();
                    return { ...item, drugDetails: drugData };
                  }
                  return { ...item, drugDetails: null };
                } catch (e) {
                  return { ...item, drugDetails: null };
                }
              }),
            );
            return { ...p, prescriptionItems: detailedItems };
          }
          return p;
        }),
      );

      renderMedsList(detailedPrescriptions);
      renderMedsPager(page, totalPages, prescriptions.length);
    } catch (err) {
      container.innerHTML = `<div class="panel" style="color:var(--danger); text-align:center;">تعذر تحميل الوصفات: ${err.message}</div>`;
    }
  }

  function translatePrescriptionStatus(status) {
    const s = String(status || "")
      .toLowerCase()
      .trim();
    if (s === "pendingpayment") return "في انتظار الدفع";
    if (s === "readytodispense") return "جاهزة للصرف";
    if (s === "dispensed") return "تم الصرف";
    return status || "-";
  }

  function getPrescriptionStatusClass(status) {
    const s = String(status || "")
      .toLowerCase()
      .trim();
    if (s === "pendingpayment") return "pending";
    if (s === "readytodispense") return "scheduled";
    if (s === "dispensed") return "completed";
    return "";
  }

  function renderMedsList(list) {
    const container = document.getElementById("meds-list");
    container.innerHTML = "";

    const fragment = document.createDocumentFragment();
    list.forEach((p) => {
      const div = document.createElement("div");
      div.className = "appointment-card";

      const statusClass = getPrescriptionStatusClass(p.status);
      const statusText = translatePrescriptionStatus(p.status);
      const dateStr = formatAppointmentDateTime(p.dateIssued);

      const itemsHtml =
        p.prescriptionItems && p.prescriptionItems.length > 0
          ? p.prescriptionItems
              .map((item) => {
                const drug = item.drugDetails || {};
                const tradeName =
                  drug.tradeName ||
                  `دواء غير معروف (رقم ${item.drugCatalogId})`;
                const genericName = drug.genericName || "غير محدد";
                const description = drug.description || "لا توجد تفاصيل إضافية";

                return `
            <div style="background:#f8fafc; padding:14px; border-radius:8px; margin-top:12px; border:1px solid #eef3fb; display:flex; flex-direction:column; gap:8px;">
               <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 10px; flex-wrap: wrap;">
                   <div>
                       <div style="font-weight:800; color:var(--primary); font-size:16px;">${escapeHtml(tradeName)}</div>
                       <div style="font-size:13px; color:#51607a; margin-top:2px;">الاسم العلمي: <span dir="ltr">${escapeHtml(genericName)}</span></div>
                   </div>
                   <div style="background:#e9eefc; color:var(--accent); padding:4px 10px; border-radius:6px; font-size:13px; font-weight:700;">
                       الكمية: ${item.quantity}
                   </div>
               </div>
               <div style="font-size:13px; color:#33415a;">
                  <strong>دواعي الاستعمال:</strong> ${escapeHtml(description)}
               </div>
               <div style="font-size:14px; color:#167a37; background:#e9f9ee; padding:8px 12px; border-radius:6px; border:1px solid #bfe8cd; margin-top:4px;">
                  <strong>الإرشادات:</strong> ${escapeHtml(item.instructions || "لا توجد إرشادات محددة")}
               </div>
            </div>
          `;
              })
              .join("")
          : '<div style="font-size:13px; color:#51607a; margin-top:8px;">لا توجد أدوية مدرجة في هذه الوصفة.</div>';

      const isPendingPayment =
        String(p.status || "")
          .toLowerCase()
          .trim() === "pendingpayment";
      const actionHtml = isPendingPayment
        ? `
          <div class="appointment-actions" style="margin-top:12px; border-top: 1px solid #f0f4fb; padding-top: 12px; display:flex; justify-content:space-between; align-items:center;">
             <span style="font-size: 13px; color: #b00020; font-weight: bold; background: #ffecec; padding: 6px 10px; border-radius: 6px; border: 1px solid #f1b6b6;">يرجى سداد الفاتورة ليتم صرف الدواء</span>
             <button class="btn small" type="button" onclick="goToBillsTab()">دفع الفاتورة</button>
          </div>
        `
        : "";

      div.innerHTML = `
        <div class="topline" style="align-items: flex-start;">
          <div class="meta" style="width: 100%;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-bottom:12px">
                <div style="display:flex;gap:8px;align-items:center;">
                    <span class="appointment-badge ${statusClass}">${statusText}</span>
                    <strong>${dateStr}</strong>
                </div>
                <div style="font-size:15px;font-weight:700;color:var(--text); background:#eef3fb; padding:4px 10px; border-radius:6px;">
                    وصفة #${p.id}
                </div>
            </div>
            <div style="font-size:14px;color:#33415a;margin-top:6px; border-bottom: 1px dashed #eef3fb; padding-bottom: 10px;">
                مُصدرة بواسطة: <strong>د. ${escapeHtml(p.doctorName)}</strong>
            </div>
            <div style="margin-top:14px;">
                <div style="font-size:14px; font-weight:700;">تفاصيل الأدوية الموصوفة:</div>
                ${itemsHtml}
            </div>
          </div>
        </div>
        ${actionHtml}
      `;
      fragment.appendChild(div);
    });
    container.appendChild(fragment);
  }

  function renderMedsPager(page, totalPages, currentCount) {
    const pager = document.getElementById("meds-pager");
    if (!pager) return;

    const hasPrev = page > 1;
    const hasNext = totalPages
      ? page < totalPages
      : currentCount >= medPageSize;

    pager.innerHTML = `
      <div class="pager-info">الصفحة ${page}${totalPages ? ` من ${totalPages}` : ""}</div>
      <div class="pager-actions">
        <button type="button" class="btn ghost" id="medsPrevBtn" ${hasPrev ? "" : "disabled"}>السابق</button>
        <button type="button" class="btn ghost" id="medsNextBtn" ${hasNext ? "" : "disabled"}>التالي</button>
      </div>
    `;

    document.getElementById("medsPrevBtn")?.addEventListener("click", () => {
      if (currentMedPage > 1) {
        currentMedPage--;
        loadMeds(currentMedPage);
      }
    });
    document.getElementById("medsNextBtn")?.addEventListener("click", () => {
      if (totalPages && currentMedPage < totalPages) {
        currentMedPage++;
        loadMeds(currentMedPage);
      } else if (!totalPages && currentCount >= medPageSize) {
        currentMedPage++;
        loadMeds(currentMedPage);
      }
    });
  }

  /* ===== WORKING DOCTORS LOGIC ===== */
  function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const parts = String(timeStr).split(":");
    if (parts.length < 2) return null;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }

  function isDoctorWorkingNow(schedule, now) {
    const currentDay = now.getDay();
    if (schedule.dayIndex !== currentDay) return false;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = timeToMinutes(schedule.startTime);
    const endMinutes = timeToMinutes(schedule.endTime);
    if (startMinutes === null || endMinutes === null) return false;
    if (endMinutes < startMinutes) {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    } else {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }
  }

  async function loadWorkingDoctorsToday() {
    const listContainer = document.getElementById("working-doctors-list");
    const now = getSudanTime();

    if (listContainer) {
      listContainer.innerHTML =
        '<div style="font-size:13px; color:#51607a; padding:10px; text-align:center;">جاري تحميل الأطباء...</div>';
    }

    try {
      const data = await apiGet(
        `${API_BASE}/api/Doctor?PageNumber=1&PageSize=50`,
      );
      const allDoctors = normalizeApiList(data);

      if (!allDoctors || allDoctors.length === 0) {
        if (listContainer) {
          listContainer.innerHTML =
            '<div style="font-size:13px; color:#51607a; padding:10px; text-align:center;">لا يوجد أطباء مسجلين.</div>';
        }
        animateCount("kpi-doctors", 0);
        return;
      }

      const schedulePromises = allDoctors.map(async (doc) => {
        const docId = doc?.id ?? doc?.Id;
        if (docId === null || docId === undefined) return null;
        try {
          const schedules = await loadDoctorSchedules(docId);
          return { doc, schedules };
        } catch (err) {
          return null;
        }
      });

      const doctorsWithSchedules = (await Promise.all(schedulePromises)).filter(
        Boolean,
      );

      const workingDoctorsNow = [];
      let doctorsWorkingTodayCount = 0;

      for (const item of doctorsWithSchedules) {
        const { doc, schedules } = item;
        let isWorkingNow = false;
        let isWorkingToday = false;

        for (const schedule of schedules) {
          if (schedule.dayIndex === now.getDay()) {
            isWorkingToday = true;
          }
          if (isDoctorWorkingNow(schedule, now)) {
            isWorkingNow = true;
          }
        }

        if (isWorkingToday) doctorsWorkingTodayCount++;
        if (isWorkingNow) workingDoctorsNow.push(doc);
      }

      animateCount("kpi-doctors", doctorsWorkingTodayCount);

      if (!listContainer) return;
      listContainer.innerHTML = "";

      if (workingDoctorsNow.length === 0) {
        const currentTimeStr =
          now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");
        const currentDayName = [
          "الأحد",
          "الاثنين",
          "الثلاثاء",
          "الأربعاء",
          "الخميس",
          "الجمعة",
          "السبت",
        ][now.getDay()];
        listContainer.innerHTML = `
          <div style="font-size:13px; color:#51607a; padding:10px; text-align:center;">
            لا يوجد أطباء يعملون الآن.<br>
            <small style="color:#999">(الوقت الآن: ${currentTimeStr} - ${currentDayName})</small>
          </div>
        `;
        return;
      }

      const fragment = document.createDocumentFragment();
      workingDoctorsNow.forEach((doc) => {
        const fName = doc.firstName || doc.FirstName || "";
        const lName = doc.lastName || doc.LastName || "";
        const specialty = doc.specialty || doc.Specialty || "-";
        const phone = doc.phoneNumber || doc.PhoneNumber || "-";
        const docId = doc.id || doc.Id;

        const div = document.createElement("div");
        div.className = "doctor";
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.alignItems = "center";
        div.style.gap = "12px";
        div.style.padding = "12px 0";
        div.style.borderBottom = "1px solid #f0f4fb";

        div.innerHTML = `
          <div class="meta" style="flex:1">
            <div style="font-weight: 700">د. ${escapeHtml(fName)} ${escapeHtml(lName)}</div>
            <div style="font-size: 12px; color: #51607a; margin-top: 4px;">
              ${escapeHtml(specialty)} — <span dir="ltr">${escapeHtml(phone)}</span>
            </div>
          </div>
          <div style="flex-shrink:0">
            <button type="button" class="btn small ghost" onclick="openBookingModalForDoctor(${docId})">
              حجز موعد
            </button>
          </div>
        `;
        fragment.appendChild(div);
      });

      listContainer.appendChild(fragment);
    } catch (err) {
      if (listContainer) {
        listContainer.innerHTML = `<div style="font-size:13px; color:#b00020; padding:10px; text-align:center;">فشل تحميل بيانات الأطباء</div>`;
      }
      animateCount("kpi-doctors", 0);
    }
  }

  /* ===== BOOKING MODAL FOR WORKING DOCTORS ===== */
  function ensureBookingModal() {
    if (bookingBackdrop && bookingContent) return;
    bookingBackdrop = document.createElement("div");
    bookingBackdrop.id = "bookingModalBackdrop";
    bookingBackdrop.className = "modal-backdrop";
    bookingBackdrop.setAttribute("aria-hidden", "true");

    bookingContent = document.createElement("div");
    bookingContent.className = "modal";
    bookingContent.id = "bookingModalContent";
    bookingContent.setAttribute("role", "dialog");
    bookingContent.setAttribute("aria-modal", "true");

    bookingBackdrop.appendChild(bookingContent);
    document.body.appendChild(bookingBackdrop);

    if (!bookingModalBound) {
      bookingBackdrop.addEventListener("click", (e) => {
        if (e.target === bookingBackdrop) closeBookingModal();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && bookingBackdrop?.classList.contains("show")) {
          closeBookingModal();
        }
      });
      bookingModalBound = true;
    }
  }

  function closeBookingModal() {
    if (!bookingBackdrop || !bookingContent) return;
    bookingBackdrop.classList.remove("show");
    bookingBackdrop.setAttribute("aria-hidden", "true");
    bookingContent.innerHTML = "";
    Object.assign(bookingState, {
      doctor: null,
      schedules: [],
      availableDates: [],
      selectedDate: null,
      selectedTime: null,
      nearest: true,
      submitting: false,
      bookingResult: null,
      paymentSubmitting: false,
      bankProviders: [],
      bankProvidersLoading: false,
      bankProvidersLoaded: false,
      selectedBankProviderId: null,
      selectedBankProviderName: "",
      bankCards: [],
      bankCardsLoading: false,
      selectedBankCardId: null,
    });
  }

  function buildAvailableDates(schedules, horizon = 14) {
    const byDay = new Map();
    schedules.forEach((s) => {
      const idx = s.dayIndex;
      if (idx === null) return;
      if (!byDay.has(idx)) byDay.set(idx, []);
      byDay.get(idx).push(s);
    });

    const list = [];
    const today = getSudanTime();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < horizon; i++) {
      const d = addDays(today, i);
      const idx = d.getDay();
      const daySchedules = byDay.get(idx) || [];
      if (daySchedules.length) {
        list.push({
          key: dateKeyLocal(d),
          dateObj: d,
          dayIndex: idx,
          dayLabel: dayLabelFromIndex(idx),
          schedules: daySchedules,
        });
      }
    }
    return list;
  }

  function generateSlotsForDate(dateKey, schedulesForDay) {
    const dateObj = new Date(`${dateKey}T00:00:00`);
    const now = getSudanTime();
    const isToday = dateKeyLocal(now) === dateKey;
    const slots = [];
    const seen = new Set();

    schedulesForDay.forEach((sch) => {
      const start = combineDateAndTime(dateObj, sch.startTime);
      const end = combineDateAndTime(dateObj, sch.endTime);
      let cursor = new Date(start);
      while (cursor.getTime() + 30 * 60 * 1000 <= end.getTime()) {
        if (!isToday || cursor.getTime() > now.getTime()) {
          const hh = String(cursor.getHours()).padStart(2, "0");
          const mm = String(cursor.getMinutes()).padStart(2, "0");
          const time = `${hh}:${mm}`;
          if (!seen.has(time)) {
            seen.add(time);
            slots.push(time);
          }
        }
        cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
      }
    });
    return slots.sort();
  }

  window.openBookingModalForDoctor = async function (doctorId) {
    ensureBookingModal();
    try {
      const doctorsData = await apiGet(
        `${API_BASE}/api/Doctor?PageNumber=1&PageSize=50`,
      );
      const allDoctors = normalizeApiList(doctorsData);
      const doc = allDoctors.find((d) => (d.id || d.Id) === doctorId);

      if (!doc) {
        window.showToast("لم يتم العثور على بيانات الطبيب", "error");
        return;
      }

      bookingState.doctor = doc;
      bookingState.schedules = [];
      bookingState.nearest = true;

      bookingBackdrop.classList.add("show");
      bookingBackdrop.setAttribute("aria-hidden", "false");

      bookingContent.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div>
            <div style="font-weight:800;font-size:18px">حجز موعد</div>
            <div style="font-size:13px;color:#51607a;margin-top:4px">
              ${escapeHtml(doc.firstName || "-")} ${escapeHtml(doc.lastName || "")} — ${escapeHtml(doc.specialty || "-")}
            </div>
          </div>
          <button type="button" class="btn ghost" id="closeBookingModal">إغلاق</button>
        </div>
        <div style="margin-top:14px" class="doctor-schedule-empty">جارِ تحميل مواعيد العمل...</div>
      `;

      document
        .getElementById("closeBookingModal")
        ?.addEventListener("click", closeBookingModal);

      const schedules = await loadDoctorSchedules(doctorId);
      bookingState.schedules = schedules;
      bookingState.availableDates = buildAvailableDates(schedules, 14);

      if (!bookingState.availableDates.length) {
        bookingState.nearest = true;
      } else {
        bookingState.selectedDate = bookingState.availableDates[0].key;
      }

      renderBookingModal();
    } catch (err) {
      window.showToast(
        err?.message || "تعذر تحميل مواعيد العمل لهذا الطبيب.",
        "error",
      );
      renderBookingModal();
    }
  };

  function renderBookingModal() {
    if (!bookingBackdrop || !bookingContent || !bookingState.doctor) return;
    const doc = bookingState.doctor;
    const schedules = bookingState.schedules || [];
    const availableDates = bookingState.availableDates || [];
    const selectedDate = bookingState.selectedDate;
    const nearestChecked = bookingState.nearest;
    const selectedDateInfo =
      availableDates.find((d) => d.key === selectedDate) || null;

    let slots = [];
    if (!nearestChecked && selectedDateInfo) {
      slots = generateSlotsForDate(selectedDate, selectedDateInfo.schedules);
    }

    const scheduleSummaryHtml = schedules.length
      ? schedules
          .map(
            (s) =>
              `<span class="schedule-badge" style="background:#e9ecef; color:#495057; padding:4px 10px; border-radius:8px; font-size:12px; font-weight:700;">${escapeHtml(s.dayLabel)} ${escapeHtml(s.startTime)} - ${escapeHtml(s.endTime)}</span>`,
          )
          .join("")
      : `<div class="doctor-schedule-empty">لا توجد مواعيد عمل مسجلة لهذا الطبيب.</div>`;

    let dynamicSection = "";
    if (nearestChecked) {
      // empty for nearest
    } else {
      const dateOptions = availableDates
        .map(
          (d) =>
            `<option value="${d.key}" ${selectedDate === d.key ? "selected" : ""}>${escapeHtml(d.dayLabel)} (${escapeHtml(formatArabicDate(d.dateObj))})</option>`,
        )
        .join("");
      const timeGrid = slots
        .map(
          (t) => `
                <label class="time-pill ${bookingState.selectedTime === t ? "selected" : ""}">
                    <input type="radio" name="bTime" value="${t}" class="hidden-radio" data-slot="${t}" ${bookingState.selectedTime === t ? "checked" : ""}>
                    ${t}
                </label>
            `,
        )
        .join("");

      dynamicSection = `
                <div class="form-group" style="margin-bottom:16px;">
                    <label style="display:block; font-weight:700; color:var(--text); margin-bottom:8px;">اختر اليوم المناسب:</label>
                    <select class="form-control" id="bookingDateInput">
                        ${availableDates.length ? dateOptions : `<option value="">لا توجد أيام متاحة</option>`}
                    </select>
                </div>
                <div class="form-group" style="margin-top:16px;">
                    <label style="display:block; font-weight:700; color:var(--text); margin-bottom:8px;">اختر الساعة المتاحة:</label>
                    <div class="time-grid">${timeGrid || '<div class="doctor-schedule-empty" style="color:#51607a;">لا توجد ساعات متاحة في اليوم المحدد.</div>'}</div>
                </div>
            `;
    }

    const confirmDisabled =
      bookingState.submitting ||
      (!nearestChecked &&
        !(bookingState.selectedDate && bookingState.selectedTime));

    bookingContent.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px; padding-bottom:16px;">
            <div>
            <div style="font-weight:800;font-size:20px; color:var(--text);">تأكيد حجز الموعد</div>
            </div>
            <button type="button" class="btn ghost small" id="closeBookingModal">إغلاق</button>
        </div>

        <div class="doctor-brief" style="background:#f4f7fb; padding:16px; border-radius:16px; margin-bottom:20px;">
            <strong style="font-size:16px;">د. ${escapeHtml(doc.firstName || "-")} ${escapeHtml(doc.lastName || "")}</strong>
            <div style="font-size:13px; color:var(--muted); margin-bottom:8px;">${escapeHtml(doc.specialty || "-")}</div>
            <div class="schedule-list" style="display:flex; flex-wrap:wrap; gap:8px;">${scheduleSummaryHtml}</div>
        </div>

        <div class="booking-toggle">
            <label class="toggle-option ${nearestChecked ? "active" : ""}">
                <input type="radio" name="bType" class="hidden-radio" value="nearest" ${nearestChecked ? "checked" : ""}>
                أقرب موعد
            </label>
            <label class="toggle-option ${!nearestChecked ? "active" : ""}">
                <input type="radio" name="bType" class="hidden-radio" value="custom" ${!nearestChecked ? "checked" : ""}>
                اختيار وقت مناسب
            </label>
        </div>

        <div class="booking-dynamic-area">
            ${dynamicSection}
        </div>

        <div class="modal-actions" style="display:flex; gap:12px; justify-content:flex-end; margin-top:28px;">
            <button type="button" class="btn ghost" id="cancelBookingBtn">إلغاء</button>
            <button type="button" class="btn" id="confirmBookingBtn" style="flex:1" ${confirmDisabled ? "disabled" : ""}>
            ${bookingState.submitting ? "جاري الحجز..." : "حجز الآن"}
            </button>
        </div>
        `;

    bindBookingModalEvents();
  }

  function bindBookingModalEvents() {
    if (!bookingBackdrop || !bookingContent) return;
    const doc = bookingState.doctor;
    if (!doc) return;

    const closeBtn = document.getElementById("closeBookingModal");
    const cancelBtn = document.getElementById("cancelBookingBtn");
    const confirmBtn = document.getElementById("confirmBookingBtn");

    if (closeBtn) closeBtn.addEventListener("click", closeBookingModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeBookingModal);

    const typeRadios = document.querySelectorAll('input[name="bType"]');
    typeRadios.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        bookingState.nearest = e.target.value === "nearest";
        if (bookingState.nearest) {
          bookingState.selectedDate = null;
          bookingState.selectedTime = null;
        } else if (
          !bookingState.selectedDate &&
          bookingState.availableDates.length
        ) {
          bookingState.selectedDate = bookingState.availableDates[0].key;
          bookingState.selectedTime = null;
        }
        renderBookingModal();
      });
    });

    const dateSelect = document.getElementById("bookingDateInput");
    if (dateSelect) {
      dateSelect.addEventListener("change", (e) => {
        bookingState.selectedDate = e.target.value;
        bookingState.selectedTime = null;
        renderBookingModal();
      });
    }

    const slotRadios = document.querySelectorAll('input[name="bTime"]');
    slotRadios.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        if (e.target.checked) {
          bookingState.selectedTime = e.target.value;
          renderBookingModal();
        }
      });
    });

    if (confirmBtn) {
      confirmBtn.addEventListener("click", async () => {
        if (bookingState.submitting) return;
        const payload = { doctorId: doc.id || doc.Id };
        if (!bookingState.nearest) {
          if (!bookingState.selectedDate || !bookingState.selectedTime) {
            window.showToast("يرجى تحديد اليوم والساعة.", "error");
            return;
          }
          payload.preferredDateTime = localDateTimeValue(
            bookingState.selectedDate,
            bookingState.selectedTime,
          );
        }
        try {
          bookingState.submitting = true;
          renderBookingModal();
          const data = await apiPost(`${API_BASE}/api/Appointment`, payload);
          bookingState.bookingResult = data;
          window.showToast("تم الحجز بنجاح.", "success");
          renderBookingSuccessModal();
        } catch (err) {
          window.showToast(
            err.message || "تعذر الاتصال بالسيرفر أثناء الحجز.",
            "error",
          );
          renderBookingModal();
        } finally {
          bookingState.submitting = false;
        }
      });
    }
  }

  function getAppointmentObject(responseData) {
    return (
      responseData?.appointment ||
      responseData?.Appointment ||
      responseData?.data?.appointment ||
      responseData?.data?.Appointment ||
      responseData
    );
  }
  function getInvoiceObject(responseData) {
    return (
      responseData?.invoice ||
      responseData?.Invoice ||
      responseData?.data?.invoice ||
      responseData?.data?.Invoice ||
      null
    );
  }
  function getInvoiceId(invoice) {
    return (
      invoice?.id ??
      invoice?.Id ??
      invoice?.invoiceId ??
      invoice?.InvoiceId ??
      ""
    );
  }
  function getInvoiceAmount(invoice) {
    return (
      invoice?.amount ??
      invoice?.Amount ??
      invoice?.totalAmount ??
      invoice?.TotalAmount ??
      invoice?.amountToPay ??
      invoice?.AmountToPay ??
      ""
    );
  }
  function getInvoiceStatus(invoice) {
    return (
      invoice?.status ??
      invoice?.Status ??
      invoice?.invoiceStatus ??
      invoice?.InvoiceStatus ??
      ""
    );
  }
  function getInvoiceItems(invoice) {
    return invoice?.items ?? invoice?.Items ?? [];
  }
  function getPaymentMethodLabel(v) {
    const s = String(v || "").toLowerCase();
    if (s === "cash") return "Cash";
    if (s === "creditcard") return "CreditCard";
    return v || "-";
  }
  function getPaymentStatusLabel(v) {
    const s = String(v || "").toLowerCase();
    if (s === "paid") return "Paid";
    if (s === "pending") return "Pending";
    if (s === "failed") return "Failed";
    return v || "-";
  }

  function normalizeBanks(payload) {
    return normalizeApiList(payload)
      .map((b) => ({ id: b.id ?? b.Id, name: b.name ?? b.Name ?? "" }))
      .filter((b) => b.id != null && b.name);
  }

  function normalizeBankCards(payload) {
    return normalizeApiList(payload)
      .map((c) => ({
        id: c.id ?? c.Id,
        cardNumber: String(c.cardNumber ?? c.CardNumber ?? ""),
        holderName: c.holderName ?? c.HolderName ?? "",
        expiryDate: c.expiryDate ?? c.ExpiryDate ?? "",
        cvv: c.cvv ?? c.CVV ?? "",
        balance: c.balance ?? c.Balance ?? "",
        bankProviderId: c.bankProviderId ?? c.BankProviderId ?? null,
        isActive: c.isActive ?? c.IsActive ?? true,
      }))
      .filter(
        (c) =>
          c.id != null &&
          c.cardNumber &&
          c.cardNumber !== "9999000011112222" &&
          c.isActive,
      );
  }

  async function ensureBankProvidersLoaded() {
    if (bookingState.bankProvidersLoaded) return bookingState.bankProviders;
    bookingState.bankProvidersLoading = true;
    try {
      const data = await apiGet(`${API_BASE}/api/Banks`);
      bookingState.bankProviders = normalizeBanks(data);
      bookingState.bankProvidersLoaded = true;
      return bookingState.bankProviders;
    } finally {
      bookingState.bankProvidersLoading = false;
    }
  }

  async function ensureBankCardsLoaded(bankId) {
    if (!bankId) return [];
    if (bankCardsCache.has(bankId)) return bankCardsCache.get(bankId);
    const promise = apiGet(`${API_BASE}/api/Banks/${bankId}`)
      .then((data) => normalizeBankCards(data))
      .catch((err) => {
        bankCardsCache.delete(bankId);
        throw err;
      });
    bankCardsCache.set(bankId, promise);
    return promise;
  }

  function getBankLogoPath(bankName) {
    const key = String(bankName || "")
      .toLowerCase()
      .trim();
    return BANK_LOGOS[key] || "";
  }

  function renderBookingSuccessModal() {
    const result = bookingState.bookingResult || {};
    const appointment = getAppointmentObject(result);
    const invoice = getInvoiceObject(result);

    const invoiceId = getInvoiceId(invoice);
    const invoiceAmount = getInvoiceAmount(invoice);
    const invoiceStatus = getInvoiceStatus(invoice);
    const invoiceItems = getInvoiceItems(invoice);

    const itemsHtml =
      invoiceItems && invoiceItems.length
        ? `
        <div style="margin-top:10px">
          <div style="font-weight:800;margin-bottom:8px">عناصر الفاتورة</div>
          <div style="display:grid;gap:8px">
            ${invoiceItems
              .map(
                (it) => `
                <div class="invoice-item-row" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #eee;">
                  <div><strong>${escapeHtml(it.itemName || it.ItemName || "-")}</strong></div>
                  <div style="font-size:13px;color:#51607a">
                    الكمية: ${escapeHtml(it.quantity ?? it.Quantity ?? "-")} |
                    سعر الوحدة: ${escapeHtml(it.unitPrice ?? it.UnitPrice ?? "-")} |
                    الإجمالي: ${escapeHtml(it.subtotal ?? it.Subtotal ?? "-")}
                  </div>
                </div>
              `,
              )
              .join("")}
          </div>
        </div>
      `
        : "";

    bookingContent.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <div style="font-weight:800;font-size:18px">تم الحجز بنجاح</div>
          <div style="font-size:13px;color:#51607a;margin-top:4px">يمكنك الدفع الآن أو الرجوع للوحة لاحقاً</div>
        </div>
        <button type="button" class="btn ghost" id="closeSuccessModal">إغلاق</button>
      </div>
      <div class="booking-summary" style="margin-top:16px;">
        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-title">تفاصيل الموعد</div>
            <div class="summary-item"><strong>الطبيب:</strong> ${escapeHtml(appointment?.doctorName || `${bookingState.doctor?.firstName || ""} ${bookingState.doctor?.lastName || ""}` || "-")}</div>
            <div class="summary-item"><strong>التخصص:</strong> ${escapeHtml(appointment?.doctorSpecialization || bookingState.doctor?.specialty || "-")}</div>
            <div class="summary-item"><strong>الوقت:</strong> <span dir="ltr">${escapeHtml(appointment?.appointmentDateTime || appointment?.AppointmentDateTime || "-")}</span></div>
            <div class="summary-item"><strong>الحالة:</strong> ${escapeHtml(appointment?.status || "Pending")}</div>
          </div>
          <div class="summary-card">
            <div class="summary-title">تفاصيل الفاتورة</div>
            <div class="summary-item"><strong>رقم الفاتورة:</strong> ${escapeHtml(invoiceId || "-")}</div>
            <div class="summary-item"><strong>المطلوب دفعه:</strong> ${escapeHtml((invoice?.amountToPay ?? invoice?.AmountToPay ?? invoiceAmount) || "-")}</div>
            <div class="summary-item"><strong>Status:</strong> ${escapeHtml(invoiceStatus || "Unpaid")}</div>
          </div>
        </div>
        ${itemsHtml}
      </div>
      <div style="margin-top:18px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
        <button type="button" class="btn ghost outline-danger" id="payLaterBtn">الدفع لاحقاً</button>
        <button type="button" class="btn success-btn" id="payNowBtn">الدفع الآن</button>
      </div>
    `;

    document
      .getElementById("closeSuccessModal")
      .addEventListener("click", closeBookingModal);
    document.getElementById("payLaterBtn").addEventListener("click", () => {
      closeBookingModal();
      window.location.reload();
    });
    document.getElementById("payNowBtn").addEventListener("click", async () => {
      await ensureBankProvidersLoaded();
      renderPaymentModal();
    });
  }

  function renderPaymentModal() {
    const result = bookingState.bookingResult || {};
    const invoice = getInvoiceObject(result);
    const invoiceId = getInvoiceId(invoice);
    const invoiceAmount = getInvoiceAmount(invoice);
    const invoiceStatus = getInvoiceStatus(invoice);
    const selectedBankProvider =
      bookingState.bankProviders.find(
        (b) => String(b.id) === String(bookingState.selectedBankProviderId),
      ) || null;

    const bankProviderCards = bookingState.bankProviders.length
      ? bookingState.bankProviders
          .map((bank) => {
            const active =
              String(bookingState.selectedBankProviderId) === String(bank.id)
                ? "active"
                : "";
            const logoPath = getBankLogoPath(bank.name);
            const fallback = bank.name
              ? bank.name.trim().charAt(0).toUpperCase()
              : "?";
            return `
            <button type="button" class="bank-provider-card ${active}" data-bank-id="${escapeHtml(bank.id)}" data-bank-name="${escapeHtml(bank.name)}">
              <span class="bank-provider-logo">
                ${logoPath ? `<img src="${escapeHtml(logoPath)}" alt="${escapeHtml(bank.name)}" />` : `<span class="bank-provider-fallback">${escapeHtml(fallback)}</span>`}
              </span>
              <span class="bank-provider-name">${escapeHtml(bank.name)}</span>
            </button>
          `;
          })
          .join("")
      : bookingState.bankProvidersLoading
        ? `<div class="doctor-schedule-empty">جاري تحميل البنوك...</div>`
        : `<div class="doctor-schedule-empty">لا توجد بنوك متاحة.</div>`;

    const cardsOptions = bookingState.bankCards.length
      ? `<option value="">اختر بطاقة</option>${bookingState.bankCards.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.cardNumber)}</option>`).join("")}`
      : bookingState.bankCardsLoading
        ? `<option value="">جاري تحميل البطاقات...</option>`
        : `<option value="">اختر بنكاً أولاً</option>`;

    bookingContent.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <div style="font-weight:800;font-size:18px">دفع الفاتورة</div>
          <div style="font-size:13px;color:#51607a;margin-top:4px">اختر البنك أولاً ثم بطاقة الدفع</div>
        </div>
        <button type="button" class="btn ghost" id="closePaymentModal">إغلاق</button>
      </div>

      <div class="booking-summary" style="margin-top:16px;">
        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-title">ملخص الفاتورة</div>
            <div class="summary-item"><strong>رقم الفاتورة:</strong> ${escapeHtml(invoiceId || "-")}</div>
            <div class="summary-item"><strong>المطلوب دفعه:</strong> ${escapeHtml((invoice?.amountToPay ?? invoice?.AmountToPay ?? invoiceAmount) || "-")}</div>
          </div>
          <div class="summary-card">
            <div class="summary-title">معلومات الحجز</div>
            <div class="summary-item"><strong>الطبيب:</strong> ${escapeHtml(bookingState.doctor?.firstName || "-")} ${escapeHtml(bookingState.doctor?.lastName || "")}</div>
            <div class="summary-item"><strong>البنك المختار:</strong> ${escapeHtml(selectedBankProvider?.name || "لم يتم الاختيار بعد")}</div>
          </div>
        </div>
      </div>

      <form id="paymentForm" class="payment-form">
        <input type="hidden" id="payment_invoiceId" value="${escapeHtml(invoiceId)}" />
        <div class="payment-grid">
          <div class="summary-card">
            <div class="summary-title">اختر البنك</div>
            <div id="bankProvidersContainer" class="bank-provider-grid">${bankProviderCards}</div>
          </div>
          <div class="summary-card">
            <div class="summary-title">البطاقات المتاحة</div>
            <div id="bankCardsContainer">
              <div class="form-group">
                <select id="bankCardIdSelect" class="form-control" ${bookingState.selectedBankProviderId ? "" : "disabled"}>
                  ${cardsOptions}
                </select>
              </div>
            </div>
          </div>
        </div>
        <div class="form-group" style="margin-top:14px">
          <label style="font-weight:700; margin-bottom:8px; display:block;">ملاحظات</label>
          <textarea id="paymentNotes" class="form-control" rows="3" placeholder="اكتب أي ملاحظات هنا..."></textarea>
        </div>
        <div style="margin-top:18px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
          <button type="button" class="btn ghost outline-danger" id="backToSummaryBtn">الرجوع</button>
          <button type="submit" class="btn success-btn" id="submitPaymentBtn">إتمام الدفع</button>
        </div>
      </form>
    `;

    document
      .getElementById("closePaymentModal")
      .addEventListener("click", () => {
        closeBookingModal();
        window.location.reload();
      });
    document
      .getElementById("backToSummaryBtn")
      .addEventListener("click", () => renderBookingSuccessModal());

    const bankProvidersContainer = document.getElementById(
      "bankProvidersContainer",
    );
    bankProvidersContainer.querySelectorAll("[data-bank-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        bookingState.selectedBankProviderId = btn.getAttribute("data-bank-id");
        bookingState.selectedBankProviderName =
          btn.getAttribute("data-bank-name") || "";
        bookingState.selectedBankCardId = null;
        bookingState.bankCards = [];
        bookingState.bankCardsLoading = true;
        renderPaymentModal();
        try {
          bookingState.bankCards = await ensureBankCardsLoaded(
            bookingState.selectedBankProviderId,
          );
        } catch (err) {
          bookingState.bankCards = [];
        } finally {
          bookingState.bankCardsLoading = false;
          renderPaymentModal();
        }
      });
    });

    const bankCardSelect = document.getElementById("bankCardIdSelect");
    if (bankCardSelect) {
      bankCardSelect.addEventListener("change", () => {
        bookingState.selectedBankCardId = bankCardSelect.value || null;
      });
    }

    document
      .getElementById("paymentForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById("submitPaymentBtn");
        const notes = document.getElementById("paymentNotes").value.trim();
        const invoiceIdValue = Number(
          document.getElementById("payment_invoiceId").value,
        );
        const bankProviderId = bookingState.selectedBankProviderId;
        const bankCardId =
          bookingState.selectedBankCardId || bankCardSelect?.value || "";

        if (!invoiceIdValue || !bankProviderId || !bankCardId) {
          window.showToast("يرجى اختيار البنك والبطاقة.", "warning");
          return;
        }

        const payload = {
          invoiceId: invoiceIdValue,
          paymentMethod: "CreditCard",
          bankCardId: Number(bankCardId),
          notes: notes,
        };

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = "جاري الدفع...";
          await apiPost(PAYMENT_API_URL, payload);
          window.showToast("تم الدفع بنجاح.", "success");
          setTimeout(() => {
            closeBookingModal();
            window.location.reload();
          }, 1600);
        } catch (err) {
          window.showToast(err.message || "فشل إتمام الدفع.", "error");
          submitBtn.disabled = false;
          submitBtn.textContent = "إتمام الدفع";
        }
      });
  }

  /* ===== BILLS & PAYMENTS LOGIC ===== */
  async function initBillsAndPayments() {
    loadBills(1);

    const container = document.getElementById("payments-list");
    container.innerHTML =
      '<div class="panel" style="text-align:center;">جاري تجميع المدفوعات...</div>';
    try {
      const invResp = await window.authFetch(
        `${API_BASE}/api/Invoice/Patient?PageNumber=1&PageSize=100`,
      );
      const invData = await invResp.json();
      const invoices = normalizeApiList(invData);

      if (invoices.length > 0) {
        const paymentPromises = invoices.map((inv) =>
          window
            .authFetch(
              `${API_BASE}/api/Payment/Invoice/${inv.id}?PageNumber=1&PageSize=50`,
            )
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => normalizeApiList(data))
            .catch(() => []),
        );
        const paymentsArrays = await Promise.all(paymentPromises);
        allPatientPayments = paymentsArrays.flat();

        allPatientPayments.sort(
          (a, b) =>
            new Date(b.paymentDate || b.PaymentDate) -
            new Date(a.paymentDate || a.PaymentDate),
        );

        currentPaymentPage = 1;
        loadPaymentsClientSide(currentPaymentPage);
      } else {
        allPatientPayments = [];
        loadPaymentsClientSide(1);
      }
    } catch (err) {
      container.innerHTML =
        '<div class="panel" style="color:var(--danger); text-align:center;">تعذر تجميع المدفوعات.</div>';
    }
  }

  async function loadBills(page = currentBillPage) {
    const billsContainer = document.getElementById("bills-list");
    const pager = document.getElementById("bills-pager");
    if (billsContainer)
      billsContainer.innerHTML =
        '<div class="panel" style="text-align:center;">جاري تحميل الفواتير...</div>';
    if (pager) pager.innerHTML = "";

    try {
      const invResp = await window.authFetch(
        `${API_BASE}/api/Invoice/Patient?PageNumber=${page}&PageSize=${billPageSize}`,
      );
      const invData = await invResp.json();
      const invoices = normalizeApiList(invData);
      window.patientData.invoices = invoices;

      const totalCount = invData.totalCount || invData.TotalCount || 0;
      const totalPages = Math.ceil(totalCount / billPageSize);

      renderInvoices(invoices);
      renderBillPager(page, totalPages, invoices.length);
    } catch (err) {
      if (billsContainer)
        billsContainer.innerHTML = `<div class="panel" style="color:var(--danger);">تعذر تحميل الفواتير: ${err.message}</div>`;
    }
  }

  function renderInvoices(list) {
    const container = document.getElementById("bills-list");
    if (!container) return;
    container.innerHTML = "";

    if (!list || list.length === 0) {
      container.innerHTML =
        '<div class="panel" style="text-align:center;">لا توجد فواتير.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    list.forEach((b) => {
      const div = document.createElement("div");
      div.className = "list-item";
      const sString = String(b.invoiceStatus || "")
        .toLowerCase()
        .trim();
      const translatedStatus = translateInvoiceStatus(b.invoiceStatus);
      const statusClass = getInvoiceStatusClass(b.invoiceStatus);
      const canPay = [
        "draft",
        "0",
        "issued",
        "1",
        "partiallypaid",
        "2",
      ].includes(sString);

      div.innerHTML = `
        <div class="item-meta">
          <div style="font-weight:700">فاتورة #${b.id}</div>
          <div style="font-size:14px;color:#51607a;margin-top:4px">
            إجمالي المبلغ: ${b.totalAmount} | يغطيه التأمين: ${b.insuranceCoveredAmount}
          </div>
          <div style="font-size:13px;color:#33415a;margin-top:6px">
            المطلوب دفعه: <strong>${b.amountToPay}</strong> — الحالة: <span class="${statusClass}">${translatedStatus}</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn ghost small" onclick="viewRealInvoice(${b.id})">التفاصيل</button>
          ${canPay ? `<button class="btn small" onclick="openPaymentModalForInvoice(${b.id})">دفع الفاتورة</button>` : ""}
        </div>
      `;
      fragment.appendChild(div);
    });
    container.appendChild(fragment);
  }

  function renderBillPager(page, totalPages, currentCount) {
    const pager = document.getElementById("bills-pager");
    if (!pager) return;

    const hasPrev = page > 1;
    const hasNext = totalPages
      ? page < totalPages
      : currentCount >= billPageSize;

    pager.innerHTML = `
      <div class="pager-info">الصفحة ${page}${totalPages ? ` من ${totalPages}` : ""}</div>
      <div class="pager-actions">
        <button type="button" class="btn ghost" id="billsPrevBtn" ${hasPrev ? "" : "disabled"}>السابق</button>
        <button type="button" class="btn ghost" id="billsNextBtn" ${hasNext ? "" : "disabled"}>التالي</button>
      </div>
    `;

    document.getElementById("billsPrevBtn")?.addEventListener("click", () => {
      if (currentBillPage > 1) {
        currentBillPage--;
        loadBills(currentBillPage);
      }
    });
    document.getElementById("billsNextBtn")?.addEventListener("click", () => {
      if (totalPages && currentBillPage < totalPages) {
        currentBillPage++;
        loadBills(currentBillPage);
      } else if (!totalPages && currentCount >= billPageSize) {
        currentBillPage++;
        loadBills(currentBillPage);
      }
    });
  }

  function loadPaymentsClientSide(page = 1) {
    const container = document.getElementById("payments-list");
    const pager = document.getElementById("payments-pager");

    if (allPatientPayments.length === 0) {
      if (container)
        container.innerHTML =
          '<div class="panel" style="text-align:center;">لا توجد مدفوعات مسجلة.</div>';
      if (pager) pager.innerHTML = "";
      return;
    }

    const totalCount = allPatientPayments.length;
    const totalPages = Math.ceil(totalCount / paymentPageSize);
    const startIndex = (page - 1) * paymentPageSize;
    const slice = allPatientPayments.slice(
      startIndex,
      startIndex + paymentPageSize,
    );

    renderPayments(slice);
    renderPaymentPager(page, totalPages);
  }

  function renderPayments(list) {
    const container = document.getElementById("payments-list");
    if (!container) return;
    container.innerHTML = "";

    const fragment = document.createDocumentFragment();
    list.forEach((p) => {
      const div = document.createElement("div");
      div.className = "list-item";

      const rawAmount =
        p.paidAmount !== undefined ? p.paidAmount : p.PaidAmount;
      const numAmount = parseFloat(rawAmount) || 0;
      const isRefund = numAmount < 0;
      const displayAmount = isRefund ? Math.abs(numAmount) : numAmount;

      const titleText = isRefund
        ? `<span style="color:#b00020">مرتجع مالي #${p.id || p.Id} للفاتورة #${p.invoiceId || p.InvoiceId}</span>`
        : `دفعية #${p.id || p.Id} للفاتورة #${p.invoiceId || p.InvoiceId}`;

      const amountLabel = isRefund ? "المبلغ المسترجع" : "المبلغ المدفوع";

      const statusBadge = isRefund
        ? `<span style="color:#b00020; font-weight:bold; margin-top:4px; display:inline-block; background: #ffecec; padding: 4px 8px; border-radius: 4px; border: 1px solid #f1b6b6; font-size:12px;">فاتورة مسترجعة (تم الإرجاع لحساب المريض)</span>`
        : `<span style="color:#167a37; font-weight:bold; margin-top:4px; display:inline-block">تمت العملية بنجاح</span>`;

      div.innerHTML = `
        <div class="item-meta">
          <div style="font-weight:700">${titleText}</div>
          <div style="font-size:14px;color:#51607a;margin-top:4px">
            التاريخ: ${formatAppointmentDateTime(p.paymentDate || p.PaymentDate)}
          </div>
          <div style="font-size:13px;color:#33415a;margin-top:6px">
            ${amountLabel}: <strong>${displayAmount}</strong> — الطريقة: ${p.paymentMethod || p.PaymentMethod || "CreditCard"}
            <br/>
            ${statusBadge}
          </div>
        </div>
      `;
      fragment.appendChild(div);
    });
    container.appendChild(fragment);
  }

  function renderPaymentPager(page, totalPages) {
    const pager = document.getElementById("payments-pager");
    if (!pager) return;

    const hasPrev = page > 1;
    const hasNext = page < totalPages;

    pager.innerHTML = `
      <div class="pager-info">الصفحة ${page}${totalPages ? ` من ${totalPages}` : ""}</div>
      <div class="pager-actions">
        <button type="button" class="btn ghost" id="paymentsPrevBtn" ${hasPrev ? "" : "disabled"}>السابق</button>
        <button type="button" class="btn ghost" id="paymentsNextBtn" ${hasNext ? "" : "disabled"}>التالي</button>
      </div>
    `;

    document
      .getElementById("paymentsPrevBtn")
      ?.addEventListener("click", () => {
        if (currentPaymentPage > 1) {
          currentPaymentPage--;
          loadPaymentsClientSide(currentPaymentPage);
        }
      });
    document
      .getElementById("paymentsNextBtn")
      ?.addEventListener("click", () => {
        if (currentPaymentPage < totalPages) {
          currentPaymentPage++;
          loadPaymentsClientSide(currentPaymentPage);
        }
      });
  }

  document
    .getElementById("refreshBillsBtn")
    ?.addEventListener("click", initBillsAndPayments);

  window.viewRealInvoice = function (id) {
    const b = window.patientData.invoices.find((x) => x.id === id);
    if (!b) return;

    const itemsHtml =
      b.items && b.items.length
        ? b.items
            .map(
              (it) => `
      <div class="invoice-item-row" style="border-bottom:1px solid #eee; padding: 6px 0;">
          <div><strong>${escapeHtml(it.itemName || "-")}</strong></div>
          <div style="font-size:13px;color:#51607a">
          النوع: ${escapeHtml(it.itemType || "-")} | الكمية: ${escapeHtml(it.quantity ?? "-")} | السعر: ${escapeHtml(it.unitPrice ?? "-")} | الإجمالي: ${escapeHtml(it.subtotal ?? "-")}
          </div>
      </div>
    `,
            )
            .join("")
        : "لا توجد عناصر لعرضها";

    const html = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:800;font-size:18px">تفاصيل فاتورة #${b.id}</div>
        <button type="button" class="btn ghost" id="closeInvoice">إغلاق</button>
      </div>
      <div style="margin-top:12px">
        <p><strong>حالة الفاتورة:</strong> ${translateInvoiceStatus(b.invoiceStatus)}</p>
        <p><strong>الإجمالي قبل التأمين:</strong> ${b.totalAmount}</p>
        <p><strong>يغطيه التأمين:</strong> ${b.insuranceCoveredAmount}</p>
        <p><strong>المطلوب دفعه:</strong> ${b.amountToPay}</p>
        <hr style="margin: 12px 0; border: 0; border-top: 1px solid #eee;" />
        <h4 style="margin-bottom: 8px;">عناصر الفاتورة</h4>
        <div>${itemsHtml}</div>
      </div>
    `;
    openModal(html);
    document
      .getElementById("closeInvoice")
      .addEventListener("click", closeModal);
  };

  window.openPaymentModalForInvoice = async function (invoiceId) {
    const inv = window.patientData.invoices.find((x) => x.id === invoiceId);
    if (!inv) return;

    paymentState.invoice = inv;
    paymentState.bankProviders = [];
    paymentState.bankProvidersLoaded = false;
    paymentState.selectedBankProviderId = null;
    paymentState.bankCards = [];
    paymentState.selectedBankCardId = null;

    const html = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div>
              <div style="font-weight:800;font-size:18px">دفع فاتورة #${inv.id}</div>
              <div style="font-size:13px;color:#51607a;margin-top:4px">
                  اختر البنك أولاً ثم بطاقة الدفع
              </div>
          </div>
          <button type="button" class="btn ghost" id="closePaymentModal">إغلاق</button>
      </div>
      <div id="paymentModalContentBody" style="margin-top:16px;">
          <div class="panel" style="text-align:center;">جاري تحميل بيانات البنوك...</div>
      </div>
    `;
    openModal(html);
    document
      .getElementById("closePaymentModal")
      .addEventListener("click", closeModal);

    await ensureBankProvidersLoadedForPayment();
    renderPaymentModalUI();
  };

  async function ensureBankProvidersLoadedForPayment() {
    if (paymentState.bankProvidersLoaded) return paymentState.bankProviders;
    paymentState.bankProvidersLoading = true;
    try {
      const data = await apiGet(`${API_BASE}/api/Banks`);
      paymentState.bankProviders = normalizeBanks(data);
      paymentState.bankProvidersLoaded = true;
    } catch (err) {
      console.error(err);
    } finally {
      paymentState.bankProvidersLoading = false;
    }
  }

  async function loadBankCardsForPayment(bankId) {
    try {
      paymentState.bankCardsLoading = true;
      renderPaymentModalUI();
      const data = await apiGet(`${API_BASE}/api/Banks/${bankId}`);
      paymentState.bankCards = normalizeBankCards(data);
    } catch (err) {
      console.error(err);
    } finally {
      paymentState.bankCardsLoading = false;
      renderPaymentModalUI();
    }
  }

  function renderPaymentModalUI() {
    const container = document.getElementById("paymentModalContentBody");
    if (!container) return;

    const inv = paymentState.invoice;
    const selectedBankProvider =
      paymentState.bankProviders.find(
        (b) => String(b.id) === String(paymentState.selectedBankProviderId),
      ) || null;

    const bankProviderCards = paymentState.bankProviders.length
      ? paymentState.bankProviders
          .map((bank) => {
            const active =
              String(paymentState.selectedBankProviderId) === String(bank.id)
                ? "active"
                : "";
            const logoPath = getBankLogoPath(bank.name);
            const fallback = bank.name
              ? bank.name.trim().charAt(0).toUpperCase()
              : "?";
            return `
            <button type="button" class="bank-provider-card ${active}" data-bank-id="${escapeHtml(bank.id)}">
                <span class="bank-provider-logo">
                ${logoPath ? `<img src="${escapeHtml(logoPath)}" alt="${escapeHtml(bank.name)}" />` : `<span class="bank-provider-fallback">${escapeHtml(fallback)}</span>`}
                </span>
                <span class="bank-provider-name">${escapeHtml(bank.name)}</span>
            </button>
          `;
          })
          .join("")
      : `<div style="font-size:13px;">لا توجد بنوك متاحة.</div>`;

    const cardsOptions = paymentState.bankCards.length
      ? `<option value="">اختر بطاقة</option>${paymentState.bankCards.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.cardNumber)}</option>`).join("")}`
      : paymentState.bankCardsLoading
        ? `<option value="">جاري تحميل البطاقات...</option>`
        : `<option value="">اختر بنكاً أولاً</option>`;

    container.innerHTML = `
      <div class="booking-summary">
        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-title">ملخص الفاتورة #${inv.id}</div>
            <div class="summary-item"><strong>رقم الفاتورة:</strong> ${escapeHtml(inv.id || "-")}</div>
            <div class="summary-item"><strong>Total Amount:</strong> ${escapeHtml(inv.totalAmount ?? "-")}</div>
            <div class="summary-item"><strong>Insurance Covered:</strong> ${escapeHtml(inv.insuranceCoveredAmount ?? "-")}</div>
            <div class="summary-item"><strong>Amount To Pay:</strong> ${escapeHtml(inv.amountToPay ?? "-")}</div>
            <div class="summary-item"><strong>Status:</strong> ${translateInvoiceStatus(inv.invoiceStatus)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-title">البنك المختار</div>
            <div class="summary-item"><strong>اسم البنك:</strong> ${escapeHtml(selectedBankProvider?.name || "لم يتم الاختيار بعد")}</div>
          </div>
        </div>
      </div>
      <form id="paymentForm" class="payment-form">
        <input type="hidden" id="payment_invoiceId" value="${escapeHtml(inv.id)}" />
        <div class="payment-grid">
          <div class="summary-card">
            <div class="summary-title">اختر البنك</div>
            <div id="bankProvidersContainer" class="bank-provider-grid">
              ${bankProviderCards}
            </div>
          </div>
          <div class="summary-card">
            <div class="summary-title">البطاقات المتاحة</div>
            <div id="bankCardsContainer">
              <div class="form-group">
                <label style="font-weight:700; margin-bottom:8px; display:block;">Card Number</label>
                <select id="bankCardIdSelect" class="form-control" ${paymentState.selectedBankProviderId ? "" : "disabled"}>
                  ${cardsOptions}
                </select>
              </div>
            </div>
          </div>
        </div>
        <div class="form-group" style="margin-top:14px">
          <label style="font-weight:700; margin-bottom:8px; display:block;">Notes</label>
          <textarea id="paymentNotes" class="form-control" rows="3" placeholder="اكتب أي ملاحظات هنا..."></textarea>
        </div>
        <div style="margin-top:18px;display:flex;gap:10px;justify-content:flex-end;">
          <button type="submit" class="btn success-btn" id="submitPaymentBtn">إتمام الدفع</button>
        </div>
      </form>
    `;

    document.querySelectorAll(".bank-provider-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        paymentState.selectedBankProviderId = btn.getAttribute("data-bank-id");
        paymentState.selectedBankCardId = null;
        loadBankCardsForPayment(paymentState.selectedBankProviderId);
      });
    });

    const form = document.getElementById("paymentForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const bankCardId = document.getElementById("bankCardIdSelect").value;
        const notes = document.getElementById("paymentNotes").value.trim();

        if (!paymentState.selectedBankProviderId || !bankCardId) {
          window.showToast("الرجاء اختيار البنك والبطاقة أولاً.", "error");
          return;
        }

        const payload = {
          invoiceId: inv.id,
          paymentMethod: "CreditCard",
          bankCardId: Number(bankCardId),
          notes: notes,
        };
        const submitBtn = document.getElementById("submitPaymentBtn");
        submitBtn.disabled = true;
        submitBtn.textContent = "جاري الدفع...";

        try {
          await apiPost(PAYMENT_API_URL, payload);
          window.showToast("تم الدفع بنجاح!", "success");
          setTimeout(() => {
            closeModal();
            initBillsAndPayments();
          }, 1500);
        } catch (err) {
          window.showToast(err.message || "فشل إتمام الدفع.", "error");
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = "إتمام الدفع";
        }
      });
    }
  }

  /* ===== modal helpers ===== */
  const modalBackdrop = document.getElementById("modal-backdrop");
  const modalEl = document.getElementById("modal-content");

  function openModal(html) {
    if (!modalBackdrop || !modalEl) return;
    modalEl.innerHTML = html;
    modalBackdrop.classList.add("show");
    modalBackdrop.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    if (!modalBackdrop || !modalEl) return;
    modalBackdrop.classList.remove("show");
    modalBackdrop.setAttribute("aria-hidden", "true");
    modalEl.innerHTML = "";
  }

  /* ===== profile & account modals ===== */
  async function loadCurrentPatientProfile() {
    const resp = await window.authFetch(`${API_BASE}/api/Patient`, {
      method: "GET",
      headers: { Accept: "*/*" },
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok)
      throw new Error((data && data.message) || "فشل تحميل بيانات المريض");
    return Array.isArray(data) ? data[0] : data;
  }

  function openProfileModal(profile = {}) {
    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-weight:800;font-size:18px">تعديل الملف الشخصي</div>
      <button type="button" class="btn ghost" id="closeProfile">إغلاق</button>
    </div>
    <div style="margin-top:12px">
      <form id="profileForm">
        <div class="form-row"><label>الاسم الأول</label><input id="profile_firstname" type="text" required placeholder="أدخل الاسم الأول" /></div>
        <div class="form-row"><label>الاسم الأخير</label><input id="profile_lastname" type="text" required placeholder="أدخل الاسم الأخير" /></div>
        <div class="form-row"><label>تاريخ الميلاد</label><input id="profile_dob" type="date" required /></div>
        <div class="form-row"><label>رقم الهاتف</label><input id="profile_phone" type="tel" required placeholder="+249984015576" /><div style="font-size:12px;color:#51607a;margin-top:4px">الصيغة المطلوبة: +249 ثم 9 أرقام</div></div>
        <div class="form-row"><label>العنوان</label><input id="profile_address" type="text" required placeholder="مثال: الخرطوم، حي المطار" /></div>
        <div class="actions">
          <button type="button" class="btn ghost" id="cancelProfile">إلغاء</button>
          <button type="submit" class="btn">حفظ التغييرات</button>
        </div>
      </form>
    </div>
    `;

    document.getElementById("profileModalContent").innerHTML = html;
    document.getElementById("profileModal").classList.add("show");
    document
      .getElementById("profileModal")
      .setAttribute("aria-hidden", "false");

    document.getElementById("profile_firstname").value =
      profile?.firstName || "";
    document.getElementById("profile_lastname").value = profile?.lastName || "";
    document.getElementById("profile_phone").value = profile?.phoneNumber || "";
    document.getElementById("profile_address").value = profile?.address || "";
    if (profile?.dateOfBirth) {
      document.getElementById("profile_dob").value = new Date(
        profile.dateOfBirth,
      )
        .toISOString()
        .split("T")[0];
    }

    document
      .getElementById("closeProfile")
      .addEventListener("click", closeProfileModal);
    document
      .getElementById("cancelProfile")
      .addEventListener("click", closeProfileModal);

    document
      .getElementById("profileForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const fName = document.getElementById("profile_firstname").value.trim();
        const lName = document.getElementById("profile_lastname").value.trim();
        const dob = document.getElementById("profile_dob").value;
        const phone = document.getElementById("profile_phone").value.trim();
        const address = document.getElementById("profile_address").value.trim();

        if (!fName || !lName || !dob || !phone || !address) {
          window.showToast("الرجاء إكمال جميع الحقول المطلوبة.", "error");
          return;
        }
        if (!/^\+249\d{9}$/.test(phone)) {
          window.showToast(
            "رقم الهاتف غير صحيح. يجب أن يبدأ بـ +249 ثم 9 أرقام.",
            "error",
          );
          return;
        }

        const payload = {
          id: profile?.id ?? 0,
          firstName: fName,
          lastName: lName,
          dateOfBirth: new Date(dob).toISOString(),
          gender: profile?.gender || "Male",
          address: address,
          phoneNumber: phone,
          isDeleted: profile?.isDeleted ?? false,
        };

        try {
          const resp = await window.authFetch(`${API_BASE}/api/Patient`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Accept: "*/*" },
            body: JSON.stringify(payload),
          });
          const data = await resp.json().catch(() => null);
          if (resp.ok) {
            window.showToast("تم حفظ التغييرات بنجاح.", "success");
            document.getElementById("patientTitle").textContent =
              `لوحة المريض — ${fName} ${lName}`;
            setTimeout(() => closeProfileModal(), 900);
          } else {
            window.showToast(
              (data && (data.message || data.errorMessage)) ||
                "حدث خطأ أثناء حفظ التغييرات.",
              "error",
            );
          }
        } catch (err) {
          window.showToast("تعذر الاتصال بالسيرفر.", "error");
        }
      });
  }

  function closeProfileModal() {
    const modal = document.getElementById("profileModal");
    const content = document.getElementById("profileModalContent");
    if (modal) {
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
    }
    if (content) content.innerHTML = "";
  }

  function openChangePassModal() {
    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-weight:800;font-size:18px">تغيير كلمة المرور</div>
      <button type="button" class="btn ghost" id="closeChangePass">إغلاق</button>
    </div>
    <div style="margin-top:12px">
      <form id="changePassForm">
        <div class="form-row"><label>كلمة المرور الحالية</label><input id="curr_pass" type="password" required /></div>
        <div class="form-row"><label>كلمة المرور الجديدة</label><input id="new_pass" type="password" required /><div style="font-size:12px;color:#51607a;margin-top:4px">يجب أن تحتوي على حرف كبير وصغير ورقم وبحد أدنى 6 أحرف</div></div>
        <div class="form-row"><label>تأكيد كلمة المرور الجديدة</label><input id="conf_pass" type="password" required /></div>
        <div class="actions">
          <button type="button" class="btn ghost" id="cancelChangePass">إلغاء</button>
          <button type="submit" class="btn">تغيير</button>
        </div>
      </form>
    </div>
    `;

    document.getElementById("changePassModalContent").innerHTML = html;
    document.getElementById("changePassModal").classList.add("show");
    document
      .getElementById("changePassModal")
      .setAttribute("aria-hidden", "false");

    document
      .getElementById("closeChangePass")
      .addEventListener("click", closeChangePassModal);
    document
      .getElementById("cancelChangePass")
      .addEventListener("click", closeChangePassModal);

    document
      .getElementById("changePassForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const curr = document.getElementById("curr_pass").value;
        const nw = document.getElementById("new_pass").value;
        const cf = document.getElementById("conf_pass").value;

        if (!curr || !nw || !cf) {
          window.showToast("الرجاء إكمال جميع الحقول.", "error");
          return;
        }
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/.test(nw)) {
          window.showToast(
            "كلمة المرور الجديدة ضعيفة. يجب أن تحتوي على حرف كبير وصغير ورقم وبحد أدنى 6 أحرف.",
            "error",
          );
          return;
        }
        if (nw !== cf) {
          window.showToast(
            "تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة.",
            "error",
          );
          return;
        }

        const payload = {
          currentPassword: curr,
          newPassword: nw,
          confirmNewPassword: cf,
        };

        try {
          const resp = await window.authFetch(
            `${API_BASE}/api/Register/change-password`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "*/*" },
              body: JSON.stringify(payload),
            },
          );
          const data = await resp.json().catch(() => null);
          if (resp.ok) {
            window.showToast("تم تغيير كلمة المرور بنجاح.", "success");
            setTimeout(() => closeChangePassModal(), 900);
          } else {
            window.showToast(
              (data && (data.message || data.errorMessage)) ||
                "فشل تغيير كلمة المرور.",
              "error",
            );
          }
        } catch (err) {
          window.showToast("تعذر الاتصال بالسيرفر.", "error");
        }
      });
  }

  function closeChangePassModal() {
    const modal = document.getElementById("changePassModal");
    const content = document.getElementById("changePassModalContent");
    if (modal) {
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
    }
    if (content) content.innerHTML = "";
  }

  function openDeleteModal() {
    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-weight:800;font-size:18px;color:#b00020">حذف الحساب</div>
      <button type="button" class="btn ghost" id="closeDelete">إغلاق</button>
    </div>
    <div style="margin-top:12px">
      <p>هل أنت متأكد من أنك تريد حذف حسابك؟ هذه العملية لا يمكن التراجع عنها.</p>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn ghost" id="cancelDelete">إلغاء</button>
        <button type="button" class="btn danger" id="confirmDelete">حذف الحساب نهائياً</button>
      </div>
    </div>
    `;

    document.getElementById("deleteModalContent").innerHTML = html;
    document.getElementById("deleteModal").classList.add("show");
    document.getElementById("deleteModal").setAttribute("aria-hidden", "false");

    document
      .getElementById("closeDelete")
      .addEventListener("click", closeDeleteModal);
    document
      .getElementById("cancelDelete")
      .addEventListener("click", closeDeleteModal);

    document
      .getElementById("confirmDelete")
      .addEventListener("click", async () => {
        try {
          const resp = await window.authFetch(`${API_BASE}/api/Patient`, {
            method: "DELETE",
            headers: { Accept: "*/*" },
          });
          if (resp.ok) {
            window.showToast(
              "تم حذف الحساب بنجاح. سيتم تحويلك الآن.",
              "success",
            );
            window.TokenUtils.removeToken();
            setTimeout(() => (window.location.href = "register.html"), 1000);
          } else {
            const data = await resp.json().catch(() => null);
            window.showToast(
              (data && (data.message || data.errorMessage)) ||
                "فشل حذف الحساب.",
              "error",
            );
          }
        } catch (err) {
          window.showToast("تعذر الاتصال بالسيرفر.", "error");
        }
      });
  }

  function closeDeleteModal() {
    const modal = document.getElementById("deleteModal");
    const content = document.getElementById("deleteModalContent");
    if (modal) {
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
    }
    if (content) content.innerHTML = "";
  }

  /* ===== Insurance Modals & Logic ===== */
  function formatCoverageRules(jsonStr) {
    try {
      const rules = JSON.parse(jsonStr);
      let html = '<div style="margin-top:8px; font-size:13px; color:#51607a;">';
      const labels = {
        appointment: "المواعيد والكشفيات",
        labTests: "الفحوصات المعملية",
        medication: "الأدوية والوصفات",
      };
      for (const key in rules) {
        const percent = Math.round((rules[key].coveragePercent || 0) * 100);
        const label = labels[key] || key;
        html += `<div style="margin-bottom:4px;"><strong>${label}:</strong> نسبة التغطية ${percent}%</div>`;
      }
      html += "</div>";
      return html;
    } catch (e) {
      return '<div style="font-size:13px;color:#51607a;">لا توجد تفاصيل متاحة للتغطية</div>';
    }
  }

  window.openInsuranceModal = async function () {
    const html = `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-weight:800;font-size:18px">إضافة تأمين طبي</div>
            <button type="button" class="btn ghost" id="closeInsModal">إغلاق</button>
          </div>
          <div id="insContent" style="margin-top:16px;">
              <div style="text-align:center; padding: 20px;">جاري تحميل شركات التأمين...</div>
          </div>
      `;
    openModal(html);
    document
      .getElementById("closeInsModal")
      .addEventListener("click", closeModal);

    try {
      const resp = await window.authFetch(
        `${API_BASE}/api/Patient/InsuranceCompanys`,
      );
      if (!resp.ok) throw new Error("فشل الجلب");
      const companies = await resp.json();

      if (!companies || companies.length === 0) {
        document.getElementById("insContent").innerHTML =
          `<div style="text-align:center; color:#51607a;">لا توجد شركات تأمين متاحة حالياً.</div>`;
        return;
      }

      let compHtml = `<div class="bank-provider-grid" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));">`;
      companies.forEach((c) => {
        compHtml += `
                  <button type="button" class="bank-provider-card" onclick="loadInsurancePlans(${c.id}, '${escapeHtml(c.name)}')">
                      <span class="bank-provider-logo"><span class="bank-provider-fallback">🏥</span></span>
                      <span class="bank-provider-name" style="font-size:14px; margin-top:6px;">${escapeHtml(c.name)}</span>
                  </button>
              `;
      });
      compHtml += `</div>`;
      document.getElementById("insContent").innerHTML = `
              <div style="font-size:14px; margin-bottom:12px; color:#51607a;">اختر شركة التأمين لعرض الخطط المتاحة:</div>
              ${compHtml}
          `;
    } catch (err) {
      document.getElementById("insContent").innerHTML =
        `<div style="color:var(--danger); text-align:center;">تعذر تحميل شركات التأمين.</div>`;
    }
  };

  window.loadInsurancePlans = async function (companyId, companyName) {
    const container = document.getElementById("insContent");
    container.style.opacity = "0.5";

    try {
      const resp = await window.authFetch(
        `${API_BASE}/api/Patient/InsuranceCompany/Plans/${companyId}`,
      );
      if (!resp.ok) throw new Error("فشل الجلب");
      const plans = await resp.json();

      let plansHtml = `
              <div style="display:flex; align-items:center; gap: 8px; margin-bottom: 16px;">
                  <button class="btn ghost small" onclick="openInsuranceModal()">← رجوع للشركات</button>
                  <div style="font-weight:700; font-size:15px;">خطط شركة: ${escapeHtml(companyName)}</div>
              </div>
              <div style="display:grid; gap:12px;">
          `;

      if (plans.length === 0) {
        plansHtml += `<div style="text-align:center; color:#51607a; padding: 12px;">لا توجد خطط متاحة لهذه الشركة حالياً.</div>`;
      } else {
        plans.forEach((p) => {
          const rulesHtml = formatCoverageRules(p.coverageRulesJson);
          plansHtml += `
                      <div class="summary-card" style="border:1px solid #eef3fb; padding:16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:#fff;">
                          <div>
                              <div style="font-weight:800; font-size:16px; color:var(--primary);">${escapeHtml(p.name)}</div>
                              ${rulesHtml}
                          </div>
                          <button class="btn" id="btn-plan-${p.id}" onclick="subscribeToInsurancePlan(${p.id})">الاشتراك في الخطة</button>
                      </div>
                  `;
        });
      }
      plansHtml += `</div>`;
      container.style.opacity = "1";
      container.innerHTML = plansHtml;
    } catch (err) {
      container.style.opacity = "1";
      window.showToast("تعذر تحميل خطط التأمين للشركة المحددة.", "error");
    }
  };

  window.subscribeToInsurancePlan = async function (planId) {
    const btn = document.getElementById("btn-plan-" + planId);
    if (btn) {
      btn.disabled = true;
      btn.textContent = "جاري الإضافة...";
    }
    try {
      const now = new Date();
      const nextYear = new Date(now);
      nextYear.setFullYear(now.getFullYear() + 1);

      const payload = {
        insurancePlanId: planId,
        startDate: now.toISOString(),
        endDate: nextYear.toISOString(),
      };

      const resp = await window.authFetch(
        `${API_BASE}/api/Patient/Patient/Insurance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "*/*" },
          body: JSON.stringify(payload),
        },
      );

      if (resp.ok) {
        window.showToast("تمت إضافة التأمين الطبي بنجاح.", "success");
        closeModal();
      } else if (resp.status === 500) {
        window.showToast("عذراً، أنت مسجل بالفعل في خطة تأمين طبي.", "error");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "الاشتراك في الخطة";
        }
      } else {
        const data = await resp.json().catch(() => null);
        window.showToast(
          data?.message || "حدث خطأ أثناء إضافة التأمين.",
          "error",
        );
        if (btn) {
          btn.disabled = false;
          btn.textContent = "الاشتراك في الخطة";
        }
      }
    } catch (err) {
      window.showToast("تعذر الاتصال بالخادم.", "error");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "الاشتراك في الخطة";
      }
    }
  };

  /* ===== dropdown logic ===== */
  const accountSettingsBtn = document.getElementById("accountSettingsBtn");
  const userDropdown = document.getElementById("userDropdown");
  const userMenuRoot = document.getElementById("userMenuRoot");
  const profileBtn = document.getElementById("btn-profile");
  const changePassBtn = document.getElementById("btn-change-password");
  const deleteBtn = document.getElementById("btn-delete-account");
  const logoutBtn = document.getElementById("btn-logout");

  function openUserDropdown() {
    if (!userDropdown || !accountSettingsBtn) return;
    userDropdown.classList.add("show");
    accountSettingsBtn.setAttribute("aria-expanded", "true");
  }

  function closeUserDropdown() {
    if (!userDropdown || !accountSettingsBtn) return;
    userDropdown.classList.remove("show");
    accountSettingsBtn.setAttribute("aria-expanded", "false");
  }

  if (accountSettingsBtn && userDropdown) {
    accountSettingsBtn.setAttribute("aria-expanded", "false");
    accountSettingsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (userDropdown.classList.contains("show")) closeUserDropdown();
      else openUserDropdown();
    });
    userDropdown.addEventListener("click", (e) => e.stopPropagation());
  }

  document.addEventListener("click", (e) => {
    if (userMenuRoot && !userMenuRoot.contains(e.target)) closeUserDropdown();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeUserDropdown();
      closeProfileModal();
      closeChangePassModal();
      closeDeleteModal();
    }
  });

  if (profileBtn) {
    profileBtn.addEventListener("click", async () => {
      closeUserDropdown();
      try {
        const profile = await loadCurrentPatientProfile();
        openProfileModal(profile);
      } catch (err) {
        openProfileModal({});
        window.showToast(
          "تعذر جلب البيانات الحالية، يمكنك تعبئة الحقول يدوياً.",
          "error",
        );
      }
    });
  }

  if (changePassBtn) {
    changePassBtn.addEventListener("click", () => {
      closeUserDropdown();
      openChangePassModal();
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      closeUserDropdown();
      openDeleteModal();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (window.AppLogout && typeof window.AppLogout.logout === "function") {
        window.AppLogout.logout();
      } else if (window.TokenUtils) {
        window.TokenUtils.removeToken();
        window.location.href = "login.html";
      }
    });
  }

  /* ===== init ===== */
  function initPatientUI() {
    const token = window.TokenUtils?.getToken?.();
    if (token && window.TokenUtils.parseJwt) {
      const payload = window.TokenUtils.parseJwt(token);
      const name =
        payload?.name ||
        payload?.given_name ||
        localStorage.getItem("userName") ||
        "المريض";
      const titleEl = document.getElementById("patientTitle");
      if (titleEl) titleEl.textContent = `لوحة المريض — ${name}`;
    }

    loadAppointments(currentAppointmentStatus, currentAppointmentPage);
    loadWorkingDoctorsToday();
  }

  document
    .getElementById("btn-add-insurance")
    ?.addEventListener("click", openInsuranceModal);
  document
    .getElementById("btn-refresh")
    ?.addEventListener("click", initPatientUI);
  document
    .getElementById("btn-book-appointment")
    ?.addEventListener("click", () => (window.location.href = "doctors.html"));

  initPatientUI();

  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }
});