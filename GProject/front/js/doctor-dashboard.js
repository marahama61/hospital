/* js/doctor-dashboard.js */

document.addEventListener("DOMContentLoaded", () => {
  // التحقق من صلاحية الجلسة عند التحميل
  if (window.AppAuth && typeof window.AppAuth.initAuth === "function") {
    window.AppAuth.initAuth();
  }

  const API_BASE = "http://smarthospitalapi.somee.com";
  let currentApptPage = 1;
  const apptPageSize = 20;

  const daysMap = [
    { val: "Sunday", ar: "الأحد" },
    { val: "Monday", ar: "الاثنين" },
    { val: "Tuesday", ar: "الثلاثاء" },
    { val: "Wednesday", ar: "الأربعاء" },
    { val: "Thursday", ar: "الخميس" },
    { val: "Friday", ar: "الجمعة" },
    { val: "Saturday", ar: "السبت" },
  ];

  // ===== Helpers =====
  function updateClock() {
    const el = document.getElementById("clock");
    if (!el) return;
    const options = {
      timeZone: "Africa/Khartoum",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };
    el.textContent = new Intl.DateTimeFormat("en-GB", options).format(
      new Date(),
    );
  }

  function validatePassword(pass) {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
    return regex.test(pass);
  }

  function validateSudanesePhone(phone) {
    const regex = /^\+249\d{9}$/;
    return regex.test(phone);
  }

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

  function normalizeText(value) {
    return (value || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  }

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function closeAllModals() {
    document.querySelectorAll(".modal-backdrop").forEach((m) => {
      m.classList.remove("show");
      m.setAttribute("aria-hidden", "true");
    });
  }

  window.closeModals = closeAllModals;

  function formatAppointmentDateTime(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
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

  // ===== API Wrapper =====
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
      if (resp.status === 401 && window.AppLogout?.logout) {
        window.AppLogout.logout();
      }
      throw new Error(data?.message || `خطأ: ${resp.status}`);
    }

    return data;
  }

  // ===== Clock =====
  setInterval(updateClock, 1000);
  updateClock();

  // ===== Dropdown Logic =====
  const accountBtn = document.getElementById("accountSettingsBtn");
  const dropdown = document.getElementById("userDropdown");

  accountBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle("show");
    accountBtn.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (e) => {
    if (!dropdown) return;
    const isClickInside =
      dropdown.contains(e.target) || accountBtn.contains(e.target);
    if (!isClickInside) {
      dropdown.classList.remove("show");
      accountBtn?.setAttribute("aria-expanded", "false");
    }
  });

  // ===== Close modal on backdrop click =====
  [
    "profileModal",
    "changePassModal",
    "deleteModal",
    "cancelApptModal",
    "scheduleModal",
  ].forEach((modalId) => {
    const backdrop = document.getElementById(modalId);
    backdrop?.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        closeModal(modalId);
      }
    });
  });

  // ===== Load doctor name in welcome text =====
  async function loadDoctorHeaderInfo() {
    try {
      const doctorData = await apiRequest(`${API_BASE}/api/Doctor/s`);
      const fullName =
        `${doctorData.firstName || ""} ${doctorData.lastName || ""}`.trim();
      const doctorNameEl = document.getElementById("doctorName");
      if (doctorNameEl) {
        doctorNameEl.textContent = fullName || "الدكتور";
      }
    } catch (err) {
      const doctorNameEl = document.getElementById("doctorName");
      if (doctorNameEl) doctorNameEl.textContent = "الدكتور";
    }
  }

  loadDoctorHeaderInfo();

  // ==========================================
  // ===== Appointments Logic =====
  // ==========================================

  async function loadAppointments(page = 1) {
    const listContainer = document.getElementById("appointments-list");
    const pagerContainer = document.getElementById("appointments-pager");
    if (!listContainer) return;

    listContainer.innerHTML =
      '<p style="color: #51607a; font-size: 14px;">جاري تحميل المواعيد...</p>';

    try {
      const response = await apiRequest(
        `${API_BASE}/api/Appointment/doctor?PageNumber=${page}&PageSize=${apptPageSize}`,
        {
          headers: { accept: "application/json" },
        },
      );

      const appointments = response?.data || [];
      const totalCount = response?.totalCount || 0;
      const totalPages = Math.ceil(totalCount / apptPageSize);

      const todayStr = new Date().toLocaleDateString("en-US", {
        timeZone: "Africa/Khartoum",
      });
      const todayCount = appointments.filter((a) => {
        if (!a.appointmentDateTime) return false;
        const apptDate = new Date(a.appointmentDateTime).toLocaleDateString(
          "en-US",
          {
            timeZone: "Africa/Khartoum",
          },
        );
        const s = String(a.status || "")
          .toLowerCase()
          .trim();
        return apptDate === todayStr && (s === "scheduled" || s === "pending");
      }).length;

      const kpiEl = document.getElementById("kpi-today-appointments");
      if (kpiEl) kpiEl.textContent = todayCount;

      renderAppointments(appointments, listContainer);
      renderPager(page, totalPages, pagerContainer);
    } catch (err) {
      listContainer.innerHTML = `<p style="color:#b00020">فشل تحميل المواعيد: ${err.message}</p>`;
      pagerContainer.innerHTML = "";
    }
  }

  function renderAppointments(list, container) {
    container.innerHTML = "";

    if (!list || list.length === 0) {
      container.innerHTML =
        '<div class="panel" style="box-shadow:none;"><p style="margin:0; color:#51607a;">لا توجد مواعيد مسجلة حالياً.</p></div>';
      return;
    }

    const fragment = document.createDocumentFragment();

    list.forEach((app) => {
      const div = document.createElement("div");
      div.className = "appointment-card";

      const statusRaw = String(app.status || "")
        .toLowerCase()
        .trim();
      let statusClass = "";
      let statusLabel = app.status;

      if (statusRaw === "pending") {
        statusClass = "pending";
        statusLabel = "قيد الانتظار";
      } else if (statusRaw === "scheduled") {
        statusClass = "scheduled";
        statusLabel = "مجدول";
      } else if (statusRaw === "completed") {
        statusClass = "completed";
        statusLabel = "مكتمل";
      } else if (statusRaw === "canceled" || statusRaw === "cancelled") {
        statusClass = "canceled";
        statusLabel = "ملغى";
      }

      const canAct = statusRaw === "scheduled" || statusRaw === "pending";

      div.innerHTML = `
        <div class="topline">
          <div class="meta">
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px">
              <span class="appointment-badge ${statusClass}">${statusLabel}</span>
              <strong>${formatAppointmentDateTime(app.appointmentDateTime)}</strong>
            </div>
            <div style="font-size:14px; color:#51607a; margin-top:4px">
              المريض: <strong style="color: var(--text)">${app.patientName || "-"}</strong>
            </div>
          </div>
        </div>
        <div class="appointment-actions" style="margin-top:12px;">
          ${
            canAct
              ? `
            <button class="btn success small" type="button" onclick="startConsultation(${app.id})">بدء المعاينة</button>
            <button class="btn danger small" type="button" onclick="confirmCancelAppointment(${app.id})">إلغاء الموعد</button>
          `
              : `<span style="font-size:12px; color:#51607a;">لا توجد إجراءات متاحة لهذه الحالة</span>`
          }
        </div>
      `;
      fragment.appendChild(div);
    });

    container.appendChild(fragment);
  }

  function renderPager(page, totalPages, container) {
    if (!container) return;
    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }

    const hasPrev = page > 1;
    const hasNext = page < totalPages;

    container.innerHTML = `
      <div class="pager-info">الصفحة ${page} من ${totalPages}</div>
      <div class="pager-actions">
        <button type="button" class="btn ghost small" onclick="changeApptPage(${page - 1})" ${hasPrev ? "" : "disabled"}>السابق</button>
        <button type="button" class="btn ghost small" onclick="changeApptPage(${page + 1})" ${hasNext ? "" : "disabled"}>التالي</button>
      </div>
    `;
  }

  window.changeApptPage = function (newPage) {
    currentApptPage = newPage;
    loadAppointments(newPage);
  };

  window.startConsultation = function (id) {
    window.location.href = `consultation.html?appointmentId=${id}`;
  };

  window.confirmCancelAppointment = function (id) {
    const content = document.getElementById("cancelApptModalContent");

    openModal("cancelApptModal");
    content.innerHTML = `
      <div style="padding:20px;">
        <h3 style="color:#b00020; margin-top:0;">إلغاء الموعد</h3>
        <p>هل أنت متأكد من رغبتك في إلغاء هذا الموعد؟ سيتم إعلام المريض بذلك.</p>
        <div class="form-actions">
          <button type="button" class="btn ghost" onclick="closeModals()">تراجع</button>
          <button type="button" class="btn danger" onclick="executeCancelAppointment(${id})">تأكيد الإلغاء</button>
        </div>
      </div>
    `;
  };

  window.executeCancelAppointment = async function (id) {
    try {
      await apiRequest(`${API_BASE}/api/Appointment/cancel/${id}`, {
        method: "PUT",
      });
      window.showToast("تم إلغاء الموعد بنجاح.", "success");
      setTimeout(() => {
        closeAllModals();
        loadAppointments(currentApptPage);
      }, 1500);
    } catch (err) {
      window.showToast(err.message, "error");
    }
  };

  loadAppointments(currentApptPage);
  document
    .getElementById("refreshAppointmentsBtn")
    ?.addEventListener("click", () => {
      loadAppointments(currentApptPage);
    });

  // ==========================================
  // ===== Update Schedule (جدول العمل) =====
  // ==========================================
  document
    .getElementById("btn-update-schedule")
    ?.addEventListener("click", async () => {
      const content = document.getElementById("scheduleModalContent");
      openModal("scheduleModal");
      content.innerHTML =
        '<div style="padding:20px;">جاري تحميل جدول العمل...</div>';

      let scheduleData = [];
      try {
        const resp = await apiRequest(`${API_BASE}/api/DoctorSchedule`);
        if (Array.isArray(resp)) {
          scheduleData = resp;
        }
      } catch (err) {
        // Ignore if empty or 404
        scheduleData = [];
      }

      let tempSchedule = scheduleData.map((s, index) => ({
        _tempId: index, // identifier for UI
        dayOfWeek: s.dayOfWeek || "Sunday",
        startTime: (s.startTime || "08:00").substring(0, 5),
        endTime: (s.endTime || "15:00").substring(0, 5),
      }));

      let nextTempId = tempSchedule.length;

      function renderScheduleRows() {
        const container = document.getElementById("scheduleRowsContainer");
        if (!container) return;
        container.innerHTML = "";

        if (tempSchedule.length === 0) {
          container.innerHTML =
            '<div style="color:#51607a; font-size:13px;">لا توجد أيام عمل مسجلة. اضغط أدناه لإضافة يوم جديد.</div>';
          return;
        }

        tempSchedule.forEach((row) => {
          const rowDiv = document.createElement("div");
          rowDiv.className = "schedule-row";

          const dayOptions = daysMap
            .map(
              (d) =>
                `<option value="${d.val}" ${row.dayOfWeek === d.val ? "selected" : ""}>${d.ar}</option>`,
            )
            .join("");

          rowDiv.innerHTML = `
          <div>
            <label style="font-size:12px; color:#51607a; display:block; margin-bottom:4px;">اليوم</label>
            <select data-id="${row._tempId}" class="day-select">${dayOptions}</select>
          </div>
          <div>
            <label style="font-size:12px; color:#51607a; display:block; margin-bottom:4px;">البداية</label>
            <input type="time" data-id="${row._tempId}" class="start-input" value="${row.startTime}">
          </div>
          <div>
            <label style="font-size:12px; color:#51607a; display:block; margin-bottom:4px;">النهاية</label>
            <input type="time" data-id="${row._tempId}" class="end-input" value="${row.endTime}">
          </div>
          <div style="align-self: flex-end; padding-bottom: 2px;">
            <button type="button" class="btn ghost small danger btn-remove-row" data-id="${row._tempId}">حذف</button>
          </div>
        `;
          container.appendChild(rowDiv);
        });

        // Bind events
        container.querySelectorAll(".day-select").forEach((el) => {
          el.addEventListener("change", (e) => {
            const id = parseInt(e.target.getAttribute("data-id"));
            const row = tempSchedule.find((x) => x._tempId === id);
            if (row) row.dayOfWeek = e.target.value;
          });
        });
        container.querySelectorAll(".start-input").forEach((el) => {
          el.addEventListener("change", (e) => {
            const id = parseInt(e.target.getAttribute("data-id"));
            const row = tempSchedule.find((x) => x._tempId === id);
            if (row) row.startTime = e.target.value;
          });
        });
        container.querySelectorAll(".end-input").forEach((el) => {
          el.addEventListener("change", (e) => {
            const id = parseInt(e.target.getAttribute("data-id"));
            const row = tempSchedule.find((x) => x._tempId === id);
            if (row) row.endTime = e.target.value;
          });
        });
        container.querySelectorAll(".btn-remove-row").forEach((el) => {
          el.addEventListener("click", (e) => {
            const id = parseInt(e.target.getAttribute("data-id"));
            tempSchedule = tempSchedule.filter((x) => x._tempId !== id);
            renderScheduleRows();
          });
        });
      }

      content.innerHTML = `
      <div style="padding:20px;">
        <h3>تحديث مواعيد العمل</h3>
        <p style="font-size:13px; color:#51607a;">أضف أو احذف أيام العمل. سيتم اعتماد هذه الأوقات بشكل نهائي عند الحفظ.</p>
        
        <div id="scheduleRowsContainer" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;"></div>
        
        <button type="button" class="btn ghost small" style="margin-top:12px;" id="btnAddScheduleRow">+ إضافة يوم جديد</button>
        
        <div class="form-actions" style="margin-top:20px;">
          <button type="button" class="btn ghost" onclick="closeModals()">إلغاء</button>
          <button type="button" class="btn" id="btnSaveSchedule">حفظ المواعيد</button>
        </div>
      </div>
    `;

      renderScheduleRows();

      document
        .getElementById("btnAddScheduleRow")
        ?.addEventListener("click", () => {
          tempSchedule.push({
            _tempId: nextTempId++,
            dayOfWeek: "Sunday",
            startTime: "08:00",
            endTime: "15:00",
          });
          renderScheduleRows();
        });

      document
        .getElementById("btnSaveSchedule")
        ?.addEventListener("click", async () => {
          const btn = document.getElementById("btnSaveSchedule");
          btn.disabled = true;
          btn.textContent = "جاري الحفظ...";

          const payload = tempSchedule.map((s) => ({
            id: 0,
            dayOfWeek: s.dayOfWeek,
            startTime:
              s.startTime.length === 5 ? `${s.startTime}:00` : s.startTime,
            endTime: s.endTime.length === 5 ? `${s.endTime}:00` : s.endTime,
          }));

          try {
            await apiRequest(`${API_BASE}/api/DoctorSchedule`, {
              method: "POST",
              body: JSON.stringify(payload),
            });
            window.showToast("تم تحديث مواعيد العمل بنجاح.", "success");
            setTimeout(() => closeAllModals(), 1200);
          } catch (err) {
            window.showToast(err.message || "فشل حفظ المواعيد.", "error");
            btn.disabled = false;
            btn.textContent = "حفظ المواعيد";
          }
        });
    });

  // ==========================================
  // ===== Profile =====
  // ==========================================
  document
    .getElementById("btn-profile")
    ?.addEventListener("click", async () => {
      const content = document.getElementById("profileModalContent");

      openModal("profileModal");
      content.innerHTML =
        "<p style='padding:20px;'>جاري تحميل بياناتك والتخصصات...</p>";

      try {
        const [doctorData, specResponse] = await Promise.all([
          apiRequest(`${API_BASE}/api/Doctor/s`),
          apiRequest(
            `${API_BASE}/api/Doctor/Specializations?PageNumber=1&PageSize=49`,
          ),
        ]);

        const specializations = specResponse?.data || specResponse || [];
        const doctorSpecialtyName =
          doctorData.specialtyName ||
          doctorData.specializationName ||
          doctorData.specialty ||
          doctorData.specialization ||
          "";

        content.innerHTML = `
        <div style="padding:20px;">
          <h3>تعديل الملف الشخصي</h3>
          <form id="profileForm" style="display:grid; gap:12px; margin-top:15px;">
            <div class="field-group">
              <label>الاسم الأول</label>
              <input type="text" id="edit-firstName" value="${doctorData.firstName || ""}" required>
            </div>

            <div class="field-group">
              <label>الاسم الأخير</label>
              <input type="text" id="edit-lastName" value="${doctorData.lastName || ""}" required>
            </div>
            <div class="field-group">
              <label>رقم الهاتف (مثال: +249912345678)</label>
              <input type="text" id="edit-phone" value="${doctorData.phoneNumber || ""}" required>
            </div>

            <div class="field-group">
              <label>العنوان</label>
              <input type="text" id="edit-address" value="${doctorData.address || ""}" required>
            </div>

            <div class="field-group">
              <label>التخصص</label>
              <select id="edit-specialtyId" required>
                <option value="">اختر التخصص</option>
                ${specializations
                  .map((s) => {
                    const specName = s.name || s.specializationName || "";
                    const isSelected =
                      normalizeText(specName) ===
                      normalizeText(doctorSpecialtyName);
                    return `
                      <option value="${s.id}" ${isSelected ? "selected" : ""}>
                        ${specName}
                      </option>
                    `;
                  })
                  .join("")}
              </select>
            </div>

            <div class="form-actions">
              <button type="button" class="btn ghost" onclick="closeModals()">إلغاء</button>
              <button type="submit" class="btn">حفظ التغييرات</button>
            </div>
          </form>
        </div>
      `;

        document.getElementById("profileForm").onsubmit = async (e) => {
          e.preventDefault();

          const phone = document.getElementById("edit-phone").value.trim();
          const selectedSpecialtyId =
            document.getElementById("edit-specialtyId").value;

          if (!validateSudanesePhone(phone)) {
            window.showToast(
              "يجب أن يبدأ الرقم بـ +249 متبوعاً بـ 9 أرقام",
              "error",
            );
            return;
          }

          if (!selectedSpecialtyId) {
            window.showToast("اختر التخصص أولاً", "error");
            return;
          }

          try {
            const body = {
              firstName: document.getElementById("edit-firstName").value.trim(),
              lastName: document.getElementById("edit-lastName").value.trim(),
              phoneNumber: phone,
              address: document.getElementById("edit-address").value.trim(),
              specializationId: parseInt(selectedSpecialtyId, 10),
            };

            await apiRequest(`${API_BASE}/api/Doctor`, {
              method: "PUT",
              body: JSON.stringify(body),
            });

            window.showToast("تم تحديث البيانات بنجاح!", "success");
            setTimeout(() => {
              closeAllModals();
              location.reload();
            }, 1200);
          } catch (err) {
            window.showToast(err.message, "error");
          }
        };
      } catch (err) {
        content.innerHTML = `
        <div style="padding:20px;">
          <h3>تعديل الملف الشخصي</h3>
          <p style="color:red;">فشل تحميل البيانات: ${err.message}</p>
        </div>
      `;
      }
    });

  // ===== Change Password =====
  document
    .getElementById("btn-change-password")
    ?.addEventListener("click", () => {
      const content = document.getElementById("changePassModalContent");

      openModal("changePassModal");
      content.innerHTML = `
      <div style="padding:20px;">
        <h3>تغيير كلمة المرور</h3>
        <form id="passForm" style="display:grid; gap:12px; margin-top:15px;">
          <input type="password" id="currentPassword" placeholder="كلمة المرور الحالية" required>
          <input type="password" id="newPassword" placeholder="كلمة المرور الجديدة" required>
          <input type="password" id="confirmNewPassword" placeholder="تأكيد كلمة المرور الجديدة" required>
          <p style="font-size:12px; color:#666; margin:0;">
            * يجب أن تحتوي على حرف كبير، حرف صغير، رقم، و6 خانات على الأقل.
          </p>

          <div class="form-actions">
            <button type="button" class="btn ghost" onclick="closeModals()">إلغاء</button>
            <button type="submit" class="btn">تحديث</button>
          </div>
        </form>
      </div>
    `;

      document.getElementById("passForm").onsubmit = async (e) => {
        e.preventDefault();

        const currentPass = document.getElementById("currentPassword").value;
        const newPass = document.getElementById("newPassword").value;
        const confirmPass = document.getElementById("confirmNewPassword").value;

        if (newPass !== confirmPass) {
          window.showToast("كلمتا المرور غير متطابقتين", "error");
          return;
        }

        if (!validatePassword(newPass)) {
          window.showToast(
            "كلمة المرور الجديدة لا تستوفي الشروط (حرف كبير، صغير، رقم، 6 خانات)",
            "error",
          );
          return;
        }

        try {
          await apiRequest(`${API_BASE}/api/Register/change-password`, {
            method: "POST",
            body: JSON.stringify({
              currentPassword: currentPass,
              newPassword: newPass,
              confirmNewPassword: confirmPass,
            }),
          });

          window.showToast("تم تغيير كلمة المرور بنجاح!", "success");
          setTimeout(() => closeAllModals(), 1500);
        } catch (err) {
          window.showToast(err.message, "error");
        }
      };
    });

  // ===== Delete Account =====
  document
    .getElementById("btn-delete-account")
    ?.addEventListener("click", () => {
      const content = document.getElementById("deleteModalContent");

      openModal("deleteModal");
      content.innerHTML = `
      <div style="padding:20px;">
        <h3 style="color:#b00020; margin-top:0;">حذف الحساب نهائياً</h3>
        <p>هل أنت متأكد من حذف حسابك كطبيب؟ هذا الإجراء لا يمكن التراجع عنه.</p>
        <div class="form-actions">
          <button type="button" class="btn ghost" onclick="closeModals()">تراجع</button>
          <button type="button" id="confirmDelete" class="btn danger">تأكيد الحذف</button>
        </div>
      </div>
    `;

      document.getElementById("confirmDelete").onclick = async () => {
        try {
          await apiRequest(`${API_BASE}/api/Doctor`, { method: "DELETE" });
          window.showToast("تم حذف الحساب بنجاح. جاري تحويلك...", "success");
          setTimeout(() => {
            if (window.AppLogout?.logout) {
              window.AppLogout.logout();
            } else {
              localStorage.clear();
              window.location.href = "login.html";
            }
          }, 1500);
        } catch (err) {
          window.showToast(err.message, "error");
        }
      };
    });

  // ===== Logout =====
  document.getElementById("btn-logout")?.addEventListener("click", () => {
    if (window.AppLogout && typeof window.AppLogout.logout === "function") {
      window.AppLogout.logout();
    } else {
      localStorage.clear();
      window.location.href = "login.html";
    }
  });
});
