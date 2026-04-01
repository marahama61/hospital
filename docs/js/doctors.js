/* js/doctors.js */
document.addEventListener("DOMContentLoaded", () => {
  if (window.AppAuth && typeof window.AppAuth.initAuth === "function") {
    window.AppAuth.initAuth();
  }

  const API_BASE = "http://smarthospitalapi.somee.com/api";
  const PAYMENT_API_URL = `${API_BASE}/Payment`;
  const PAGE_SIZE = 20;

  const searchInput = document.getElementById("searchInput");
  const specializationSelect = document.getElementById("specializationSelect");
  const doctorsContainer = document.getElementById("doctorsContainer");
  const emptyState = document.getElementById("emptyState");
  const resultsCount = document.getElementById("resultsCount");
  const currentPageLabel = document.getElementById("currentPageLabel");
  const pageInfo = document.getElementById("pageInfo");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");
  const clockEl = document.getElementById("clock");

  let state = {
    doctors: [],
    currentPage: 1,
    totalPages: 1,
    search: "",
    specId: "",
  };

  const bookingState = {
    doctor: null,
    schedules: [],
    availableDates: [],
    bookingType: "nearest", // 'nearest' or 'custom'
    selectedDateStr: "",
    selectedTimeStr: "",
  };

  const paymentState = {
    invoice: null,
    appointment: null,
    doctor: null,
    bankProviders: [],
    bankProvidersLoading: false,
    selectedBankProviderId: null,
    bankCards: [],
    bankCardsLoading: false,
    selectedBankCardId: null,
  };

  const BANK_LOGOS = {
    "bank of khartoum": "images/Bankklogo.png",
    faisal: "images/faisal.jpg",
    "faisal islamic bank": "images/faisal.jpg",
    omdurman: "images/Omdurman.jpg",
    "omdurman national bank": "images/Omdurman.jpg",
  };

  // ===== Helpers =====
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
    void toast.offsetWidth;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  function updateClock() {
    if (!clockEl) return;
    const options = {
      timeZone: "Africa/Khartoum",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };
    clockEl.textContent = new Intl.DateTimeFormat("en-GB", options).format(
      new Date(),
    );
  }
  setInterval(updateClock, 1000);
  updateClock();

  function openModal(id) {
    const m = document.getElementById(id);
    if (m) {
      m.classList.add("show");
      m.setAttribute("aria-hidden", "false");
    }
  }
  window.closeModals = () =>
    document.querySelectorAll(".modal-backdrop").forEach((m) => {
      m.classList.remove("show");
      m.setAttribute("aria-hidden", "true");
    });

  function debounce(fn, delay = 450) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  async function apiFetch(url, options = {}) {
    const client = window.authFetch || window.fetch.bind(window);
    const resp = await client(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        ...options.headers,
      },
    });
    if (resp.status === 204) return null;
    const data = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error(data?.message || `خطأ ${resp.status}`);
    return data;
  }

  function getBankLogoPath(bankName) {
    const key = String(bankName || "")
      .toLowerCase()
      .trim();
    return BANK_LOGOS[key] || "";
  }

  function normalizeBankCards(payload) {
    const arr = Array.isArray(payload)
      ? payload
      : payload?.data || payload?.items || [];
    return arr
      .map((c) => ({
        id: c.id ?? c.Id,
        cardNumber: String(c.cardNumber ?? c.CardNumber ?? ""),
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

  // ===== Time & Date Logic =====
  const dayNamesMap = {
    0: { en: "Sunday", ar: "الأحد" },
    1: { en: "Monday", ar: "الإثنين" },
    2: { en: "Tuesday", ar: "الثلاثاء" },
    3: { en: "Wednesday", ar: "الأربعاء" },
    4: { en: "Thursday", ar: "الخميس" },
    5: { en: "Friday", ar: "الجمعة" },
    6: { en: "Saturday", ar: "السبت" },
  };

  function buildAvailableDates(schedules, daysAhead = 14) {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < daysAhead; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dayNum = d.getDay();
      const enDay = dayNamesMap[dayNum].en;

      const sched = schedules.find((s) => {
        const sDay = (s.dayOfWeek || s.DayOfWeek || "").toLowerCase();
        return (
          sDay === enDay.toLowerCase() ||
          sDay === dayNamesMap[dayNum].ar.toLowerCase()
        );
      });

      if (sched) {
        // Adjust month format for display
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        dates.push({
          dateObj: d,
          dateStr: `${d.getFullYear()}-${mm}-${dd}`,
          displayDate: `${dayNamesMap[dayNum].ar} (${dd}/${mm})`,
          schedule: sched,
        });
      }
    }
    return dates;
  }

  function generateTimeSlots(startStr, endStr) {
    if (!startStr || !endStr) return [];
    const slots = [];
    const [sh, sm] = startStr.split(":").map(Number);
    const [eh, em] = endStr.split(":").map(Number);
    let current = new Date(2000, 0, 1, sh, sm || 0);
    const end = new Date(2000, 0, 1, eh, em || 0);

    while (current < end) {
      const hh = String(current.getHours()).padStart(2, "0");
      const mm = String(current.getMinutes()).padStart(2, "0");
      slots.push(`${hh}:${mm}`);
      current.setMinutes(current.getMinutes() + 30);
    }
    return slots;
  }

  // ===== Doctors Loading =====
  function buildDoctorsUrl() {
    if (state.search)
      return `${API_BASE}/Doctor/Search/${encodeURIComponent(state.search)}?PageNumber=${state.currentPage}&PageSize=${PAGE_SIZE}`;
    if (state.specId)
      return `${API_BASE}/Doctor/By-Specialization/${encodeURIComponent(state.specId)}?PageNumber=${state.currentPage}&PageSize=${PAGE_SIZE}`;
    return `${API_BASE}/Doctor?PageNumber=${state.currentPage}&PageSize=${PAGE_SIZE}`;
  }

  async function loadDoctors() {
    doctorsContainer.style.opacity = "0.5";
    try {
      const res = await apiFetch(buildDoctorsUrl());
      const list = Array.isArray(res) ? res : res?.data || res?.items || [];
      const totalCount =
        res?.totalCount ??
        res?.pagination?.totalCount ??
        res?.count ??
        list.length;

      state.doctors = list;
      state.totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
      renderDoctors(totalCount);
    } catch (err) {
      window.showToast("تعذر تحميل قائمة الأطباء", "error");
    } finally {
      doctorsContainer.style.opacity = "1";
    }
  }

  function renderDoctors(totalCount) {
    doctorsContainer.innerHTML = "";
    resultsCount.textContent =
      totalCount !== undefined ? totalCount : state.doctors.length;
    currentPageLabel.textContent = state.currentPage;
    pageInfo.textContent = `صفحة ${state.currentPage} من ${state.totalPages || 1}`;

    prevBtn.disabled = state.currentPage <= 1;
    nextBtn.disabled = state.currentPage >= state.totalPages;

    if (state.doctors.length === 0) {
      emptyState.style.display = "block";
      return;
    }
    emptyState.style.display = "none";

    state.doctors.forEach((doc) => {
      const specialty = doc.specialty || doc.specializationName || "تخصص عام";
      const card = document.createElement("div");
      card.className = "doctor-card";
      card.innerHTML = `
        <div class="doctor-avatar">${doc.firstName?.[0] || "D"}</div>
        <div class="doctor-info">
          <div class="doctor-name">د. ${doc.firstName || ""} ${doc.lastName || ""}</div>
          <div class="doctor-spec">${specialty}</div>
        </div>
        <button class="btn small" onclick="window.startBooking(${doc.id})">حجز موعد</button>
      `;
      doctorsContainer.appendChild(card);
    });
  }

  // ===== Booking Logic =====
  window.startBooking = async (docId) => {
    const doc = state.doctors.find((d) => d.id === docId);
    if (!doc) return;

    bookingState.doctor = doc;
    bookingState.bookingType = "nearest";

    const content = document.getElementById("bookingModalContent");
    content.innerHTML = `<div style="padding:40px; text-align:center; font-weight:700;">جاري تحميل جدول الطبيب...</div>`;
    openModal("bookingModal");

    try {
      const res = await apiFetch(`${API_BASE}/DoctorSchedule/${docId}`);
      bookingState.schedules = Array.isArray(res)
        ? res
        : res?.data || res?.items || [];

      bookingState.availableDates = buildAvailableDates(
        bookingState.schedules,
        14,
      );

      if (bookingState.availableDates.length > 0) {
        const firstDay = bookingState.availableDates[0];
        bookingState.selectedDateStr = firstDay.dateStr;
        const times = generateTimeSlots(
          firstDay.schedule.startTime || firstDay.schedule.StartTime,
          firstDay.schedule.endTime || firstDay.schedule.EndTime,
        );
        bookingState.selectedTimeStr = times[0] || "";
      }

      window.renderBookingForm();
    } catch (err) {
      window.showToast("فشل تحميل جدول الطبيب", "error");
      closeModals("bookingModal");
    }
  };

  // Global functions for inline HTML handlers
  window.changeBookingType = (type) => {
    bookingState.bookingType = type;
    window.renderBookingForm();
  };

  window.selectDate = (dateStr) => {
    bookingState.selectedDateStr = dateStr;
    const selDay = bookingState.availableDates.find(
      (d) => d.dateStr === dateStr,
    );
    if (selDay) {
      const times = generateTimeSlots(
        selDay.schedule.startTime || selDay.schedule.StartTime,
        selDay.schedule.endTime || selDay.schedule.EndTime,
      );
      bookingState.selectedTimeStr = times[0] || "";
    }
    window.renderBookingForm();
  };

  window.selectTime = (timeStr) => {
    bookingState.selectedTimeStr = timeStr;
    window.renderBookingForm();
  };

  window.renderBookingForm = () => {
    const content = document.getElementById("bookingModalContent");

    if (
      !bookingState.schedules ||
      bookingState.schedules.length === 0 ||
      bookingState.availableDates.length === 0
    ) {
      content.innerHTML = `
          <div class="modal-padding text-center">
            <h3 class="modal-title">حجز موعد مع د. ${bookingState.doctor.firstName}</h3>
            <div class="alert danger" style="margin:20px 0;">عذراً، لا توجد مواعيد متاحة أو مسجلة لهذا الطبيب في الأسبوعين القادمين.</div>
            <button class="btn ghost w-100" onclick="window.closeModals()">إغلاق</button>
          </div>
        `;
      return;
    }

    const scheduleBadges = bookingState.schedules
      .map((s) => {
        const day = s.dayOfWeek || s.DayOfWeek;
        const arDay =
          Object.values(dayNamesMap).find(
            (m) => m.en.toLowerCase() === day.toLowerCase(),
          )?.ar || day;
        return `<span class="schedule-badge">${arDay}: ${s.startTime || s.StartTime} - ${s.endTime || s.EndTime}</span>`;
      })
      .join("");

    let dynamicSection = "";

    if (bookingState.bookingType === "nearest") {
      const selDay = bookingState.availableDates[0];
      const times = generateTimeSlots(
        selDay.schedule.startTime || selDay.schedule.StartTime,
        selDay.schedule.endTime || selDay.schedule.EndTime,
      );
      const firstTime = times[0];
      bookingState.selectedDateStr = selDay.dateStr;
      bookingState.selectedTimeStr = firstTime;
    } else {
      const dateOptions = bookingState.availableDates
        .map(
          (d) =>
            `<option value="${d.dateStr}" ${bookingState.selectedDateStr === d.dateStr ? "selected" : ""}>${d.displayDate}</option>`,
        )
        .join("");

      const selDay = bookingState.availableDates.find(
        (d) => d.dateStr === bookingState.selectedDateStr,
      );
      const times = selDay
        ? generateTimeSlots(
            selDay.schedule.startTime || selDay.schedule.StartTime,
            selDay.schedule.endTime || selDay.schedule.EndTime,
          )
        : [];

      const timeGrid = times
        .map(
          (t) => `
            <label class="time-pill ${bookingState.selectedTimeStr === t ? "selected" : ""}">
                <input type="radio" name="bTime" value="${t}" class="hidden-radio" onchange="window.selectTime('${t}')" ${bookingState.selectedTimeStr === t ? "checked" : ""}>
                ${t}
            </label>
        `,
        )
        .join("");

      dynamicSection = `
            <div class="form-group">
                <label style="font-weight:700; margin-bottom:8px; display:block;">اختر اليوم المناسب:</label>
                <select class="form-control" onchange="window.selectDate(this.value)">
                    ${dateOptions}
                </select>
            </div>
            <div class="form-group" style="margin-top:16px;">
                <label style="font-weight:700; margin-bottom:8px; display:block;">اختر الساعة المتاحة:</label>
                <div class="time-grid">${timeGrid}</div>
            </div>
        `;
    }

    content.innerHTML = `
      <div class="modal-padding">
        <h3 class="modal-title">تأكيد حجز الموعد</h3>
        <div class="doctor-brief">
            <strong>د. ${bookingState.doctor.firstName} ${bookingState.doctor.lastName || ""}</strong>
            <div class="schedule-list">${scheduleBadges}</div>
        </div>

        <div class="booking-toggle">
            <label class="toggle-option ${bookingState.bookingType === "nearest" ? "active" : ""}">
                <input type="radio" name="bType" class="hidden-radio" value="nearest" onchange="window.changeBookingType('nearest')" ${bookingState.bookingType === "nearest" ? "checked" : ""}>
                أقرب موعد
            </label>
            <label class="toggle-option ${bookingState.bookingType === "custom" ? "active" : ""}">
                <input type="radio" name="bType" class="hidden-radio" value="custom" onchange="window.changeBookingType('custom')" ${bookingState.bookingType === "custom" ? "checked" : ""}>
                اختيار وقت مناسب
            </label>
        </div>

        <div class="booking-dynamic-area">
            ${dynamicSection}
        </div>

        <div class="modal-actions">
          <button class="btn ghost" onclick="window.closeModals()">إلغاء</button>
          <button class="btn" id="submitBookingBtn" style="flex:1">حجز الآن</button>
        </div>
      </div>
    `;

    document.getElementById("submitBookingBtn").onclick = async () => {
      if (!bookingState.selectedDateStr || !bookingState.selectedTimeStr) {
        window.showToast("يرجى اختيار التاريخ والوقت", "warning");
        return;
      }

      const btn = document.getElementById("submitBookingBtn");
      btn.disabled = true;
      btn.textContent = "جاري الحجز...";

      try {
        const combinedDateTime = new Date(
          `${bookingState.selectedDateStr}T${bookingState.selectedTimeStr}:00`,
        ).toISOString();

        const payload = {
          doctorId: bookingState.doctor.id,
          appointmentDateTime: combinedDateTime,
          notes: "تم الحجز عبر البوابة",
        };

        const res = await apiFetch(`${API_BASE}/Appointment`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        window.showToast("تم حجز الموعد بنجاح!", "success");
        setTimeout(() => {
          closeModals("bookingModal");
          window.initPayment(res, bookingState.doctor);
        }, 1000);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "حجز الآن";
        window.showToast(err.message, "error");
      }
    };
  };

  // ===== Payment & Success Logic =====

  // دوال مساعدة لاستخراج الموعد والفاتورة من الرد الموحد
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

  window.initPayment = async (responseData, doctorInfo) => {
    // تخزين الرد الكامل والطبيب في حالة الدفع
    paymentState.bookingResult = responseData;
    paymentState.doctor = doctorInfo;

    const appointment = getAppointmentObject(responseData);
    const invoice = getInvoiceObject(responseData);

    if (!appointment || !invoice) {
      window.showToast(
        "تم الحجز، لكن تعذر عرض الفاتورة حالياً. يمكنك الدفع من لوحة التحكم.",
        "warning",
      );
      setTimeout(() => (window.location.href = "patient-dashboard.html"), 2500);
      return;
    }

    openModal("paymentModal");
    renderBookingSuccessModal();
  };

  async function loadBankCardsForPayment(bankId) {
    paymentState.bankCardsLoading = true;
    renderPaymentModal();
    try {
      const data = await apiFetch(`${API_BASE}/Banks/${bankId}`);
      paymentState.bankCards = normalizeBankCards(data);
    } catch (err) {
      paymentState.bankCards = [];
    } finally {
      paymentState.bankCardsLoading = false;
      renderPaymentModal();
    }
  }

  function renderBookingSuccessModal() {
    const content = document.getElementById("paymentModalContent");
    const result = paymentState.bookingResult || {};
    const appointment = getAppointmentObject(result);
    const invoice = getInvoiceObject(result);
    const doc = paymentState.doctor;

    const invoiceId = invoice?.id ?? invoice?.Id ?? "";
    const invoiceAmount =
      invoice?.amountToPay ??
      invoice?.AmountToPay ??
      invoice?.amount ??
      invoice?.Amount ??
      "";
    const invoiceStatus =
      invoice?.status ?? invoice?.Status ?? invoice?.invoiceStatus ?? "Unpaid";
    const invoiceItems = invoice?.items ?? invoice?.Items ?? [];

    const itemsHtml = invoiceItems.length
      ? `
        <div style="margin-top:10px">
          <div style="font-weight:800;margin-bottom:8px">عناصر الفاتورة</div>
          <div style="display:grid;gap:8px">
            ${invoiceItems
              .map(
                (it) => `
                <div class="invoice-item-row" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #eee;">
                  <div><strong>${it.itemName || it.ItemName || "-"}</strong></div>
                  <div style="font-size:13px;color:#51607a">
                    الكمية: ${it.quantity ?? it.Quantity ?? "-"} |
                    سعر الوحدة: ${it.unitPrice ?? it.UnitPrice ?? "-"} |
                    الإجمالي: ${it.subtotal ?? it.Subtotal ?? "-"}
                  </div>
                </div>
              `,
              )
              .join("")}
          </div>
        </div>
      `
      : "";

    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px; padding: 20px 20px 0 20px;">
        <div>
          <div style="font-weight:800;font-size:18px; color:var(--success);">تم الحجز بنجاح</div>
          <div style="font-size:13px;color:#51607a;margin-top:4px">يمكنك الدفع الآن لتأكيد الحجز أو الرجوع للوحة لاحقاً</div>
        </div>
      </div>
      
      <div class="modal-padding">
          <div class="booking-summary">
            <div class="summary-grid">
              <div class="summary-card">
                <div class="summary-title">تفاصيل الموعد</div>
                <div class="summary-item"><strong>الطبيب:</strong> د. ${doc?.firstName || ""} ${doc?.lastName || ""}</div>
                <div class="summary-item"><strong>التخصص:</strong> ${doc?.specialty || doc?.Specialty || "-"}</div>
                <div class="summary-item"><strong>الوقت:</strong> <span dir="ltr">${appointment?.appointmentDateTime || appointment?.AppointmentDateTime || "-"}</span></div>
              </div>
              <div class="summary-card">
                <div class="summary-title">تفاصيل الفاتورة</div>
                <div class="summary-item"><strong>رقم الفاتورة:</strong> #${invoiceId}</div>
                <div class="summary-item"><strong>المطلوب دفعه:</strong> ${invoiceAmount} ج.س</div>
              </div>
            </div>
            ${itemsHtml}
          </div>

          <div class="modal-actions payment-actions" style="margin-top:24px; flex-direction:row; gap:12px;">
              <button class="btn ghost outline-danger" style="flex:1" onclick="window.closeModals(); window.location.href='patient-dashboard.html'">الدفع لاحقاً</button>
              <button class="btn success-btn" style="flex:1" id="proceedToPayBtn">الدفع الآن</button>
          </div>
      </div>
    `;

    document.getElementById("proceedToPayBtn").onclick = async () => {
      content.innerHTML = `<div class="modal-padding text-center font-bold">جاري تحميل البنوك المتاحة...</div>`;
      try {
        const providersData = await apiFetch(`${API_BASE}/Banks`);
        paymentState.bankProviders = Array.isArray(providersData)
          ? providersData
          : providersData?.data || [];
        renderPaymentModal();
      } catch (err) {
        window.showToast("فشل تحميل قائمة البنوك.", "error");
        renderBookingSuccessModal();
      }
    };
  }

  function renderPaymentModal() {
    const content = document.getElementById("paymentModalContent");
    const result = paymentState.bookingResult || {};
    const invoice = getInvoiceObject(result);

    const invoiceId = invoice?.id ?? invoice?.Id ?? "";
    const invoiceAmount =
      invoice?.amountToPay ??
      invoice?.AmountToPay ??
      invoice?.amount ??
      invoice?.Amount ??
      "";

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
            <button type="button" class="bank-provider-card ${active}" data-bank-id="${bank.id}">
              <span class="bank-provider-logo">
                ${logoPath ? `<img src="${logoPath}" />` : `<span class="bank-provider-fallback">${fallback}</span>`}
              </span>
              <span class="bank-provider-name">${bank.name}</span>
            </button>
          `;
          })
          .join("")
      : `<div class="doctor-schedule-empty">لا توجد بنوك متاحة.</div>`;

    const cardsOptions = paymentState.bankCards.length
      ? `<option value="">اختر بطاقة</option>${paymentState.bankCards.map((c) => `<option value="${c.id}">${c.cardNumber}</option>`).join("")}`
      : paymentState.bankCardsLoading
        ? `<option value="">جاري تحميل البطاقات...</option>`
        : `<option value="">اختر بنكاً أولاً</option>`;

    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px; padding: 20px 20px 0 20px;">
        <div>
          <div style="font-weight:800;font-size:18px">دفع الفاتورة</div>
          <div style="font-size:13px;color:#51607a;margin-top:4px">اختر البنك أولاً ثم بطاقة الدفع</div>
        </div>
      </div>

      <div class="modal-padding" style="padding-top: 16px;">
          <div class="booking-summary">
            <div class="summary-grid">
              <div class="summary-card">
                <div class="summary-title">ملخص الفاتورة</div>
                <div class="summary-item"><strong>رقم الفاتورة:</strong> #${invoiceId}</div>
                <div class="summary-item"><strong>المطلوب دفعه:</strong> ${invoiceAmount} ج.س</div>
              </div>
              <div class="summary-card">
                <div class="summary-title">معلومات البنك</div>
                <div class="summary-item"><strong>البنك المختار:</strong> ${selectedBankProvider?.name || "لم يتم الاختيار بعد"}</div>
              </div>
            </div>
          </div>

          <form id="paymentForm" class="payment-form">
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
                      <select id="bankCardIdSelect" class="form-control" ${paymentState.selectedBankProviderId ? "" : "disabled"}>
                        ${cardsOptions}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div class="form-group" style="margin-top:14px">
                  <label style="font-weight:700; margin-bottom:8px; display:block;">ملاحظات</label>
                  <textarea id="paymentNotes" class="form-control" rows="2" placeholder="اكتب أي ملاحظات هنا..."></textarea>
              </div>

              <div class="modal-actions payment-actions" style="flex-direction:row; gap:12px;">
                  <button type="button" class="btn ghost outline-danger" style="flex:1" id="backToSummaryBtn">الرجوع</button>
                  <button type="submit" class="btn success-btn" style="flex:2" id="submitPaymentBtn">إتمام الدفع</button>
              </div>
          </form>
      </div>
    `;

    document.getElementById("backToSummaryBtn").onclick = () =>
      renderBookingSuccessModal();

    const bankProvidersContainer = document.getElementById(
      "bankProvidersContainer",
    );
    bankProvidersContainer.querySelectorAll("[data-bank-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        paymentState.selectedBankProviderId = btn.getAttribute("data-bank-id");
        paymentState.selectedBankCardId = null;
        loadBankCardsForPayment(paymentState.selectedBankProviderId);
      });
    });

    document
      .getElementById("paymentForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById("submitPaymentBtn");
        const bankCardId = document.getElementById("bankCardIdSelect").value;
        const notes = document.getElementById("paymentNotes").value.trim();

        if (!paymentState.selectedBankProviderId || !bankCardId) {
          window.showToast("يرجى اختيار البنك والبطاقة.", "warning");
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "جاري الدفع...";

        try {
          await apiFetch(PAYMENT_API_URL, {
            method: "POST",
            body: JSON.stringify({
              invoiceId: Number(invoiceId),
              paymentMethod: "CreditCard",
              bankCardId: Number(bankCardId),
              notes: notes,
            }),
          });
          window.showToast("تمت عملية الدفع بنجاح!", "success");
          setTimeout(
            () => (window.location.href = "patient-dashboard.html"),
            1500,
          );
        } catch (err) {
          submitBtn.disabled = false;
          submitBtn.textContent = "إتمام الدفع";
          window.showToast("فشل الدفع: " + err.message, "error");
        }
      });
  }
  // ===== Listeners =====
  searchInput.oninput = debounce(() => {
    state.search = searchInput.value.trim();
    if (state.search) specializationSelect.value = "";
    state.currentPage = 1;
    loadDoctors();
  }, 450);

  specializationSelect.onchange = () => {
    state.specId = specializationSelect.value;
    if (state.specId) searchInput.value = "";
    state.currentPage = 1;
    loadDoctors();
  };

  prevBtn.onclick = () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      loadDoctors();
    }
  };
  nextBtn.onclick = () => {
    if (state.currentPage < state.totalPages) {
      state.currentPage++;
      loadDoctors();
    }
  };

  clearFiltersBtn.onclick = () => {
    searchInput.value = "";
    specializationSelect.value = "";
    state.search = "";
    state.specId = "";
    state.currentPage = 1;
    loadDoctors();
  };

  // Initial Load
  (async () => {
    loadDoctors();
    try {
      const res = await apiFetch(
        `${API_BASE}/Doctor/Specializations?PageSize=50`,
      );
      const specs = Array.isArray(res) ? res : res?.data || res?.items || [];
      specs.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        specializationSelect.appendChild(opt);
      });
    } catch {}
  })();
});
