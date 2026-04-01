/* js/admin-dashboard.js */

document.addEventListener("DOMContentLoaded", () => {
  if (window.AppAuth && typeof window.AppAuth.initAuth === "function") {
    window.AppAuth.initAuth();
  }

  const API_BASE = "http://smarthospitalapi.somee.com";
  let allLoadedUsers = [];
  let availableRoles = [];
  let currentTab = "All"; // الفلتر الافتراضي
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
    }, 4000);
  };

  window.closeAllModals = function () {
    document
      .querySelectorAll(".modal-backdrop")
      .forEach((m) => m.classList.remove("show"));
  };
  document.querySelectorAll(".modal-backdrop").forEach((m) =>
    m.addEventListener("click", (e) => {
      if (e.target === m) closeAllModals();
    }),
  );

  const accountBtn = document.getElementById("accountSettingsBtn");
  const dropdown = document.getElementById("userDropdown");
  accountBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("show");
  });
  document.addEventListener("click", () => dropdown?.classList.remove("show"));

  async function apiRequest(url, options = {}) {
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

  // ===== جلب التخصصات (لإضافة الأطباء) =====
  async function fetchSpecialties() {
    try {
      const resp = await apiRequest(
        `${API_BASE}/api/Doctor/Specializations?PageNumber=1&PageSize=50`,
      );
      const select = document.getElementById("docSpecialty");
      let optionsHtml = '<option value="">-- اختر التخصص --</option>';

      if (resp && resp.data) {
        resp.data.forEach((sp) => {
          optionsHtml += `<option value="${sp.id}">${sp.name}</option>`;
        });
      }
      if (select) select.innerHTML = optionsHtml;
    } catch (err) {
      console.error("فشل جلب التخصصات:", err);
      const select = document.getElementById("docSpecialty");
      if (select)
        select.innerHTML = '<option value="">فشل تحميل التخصصات</option>';
    }
  }

  // ===== جلب الأدوار (Roles) مع استبعاد المريض =====
  async function fetchRoles() {
    try {
      const resp = await apiRequest(`${API_BASE}/api/Register/roles`);
      // إخفاء دور Patient من القائمة تماماً
      availableRoles = (resp || []).filter(
        (role) => role.name !== "Patient" && role.name !== "Doctor",
      );
      populateRoleDropdowns();
    } catch (err) {
      console.error("فشل جلب الأدوار:", err);
    }
  }

  function populateRoleDropdowns() {
    const addSelect = document.getElementById("addRoleSelect");
    const assignSelect = document.getElementById("assignRoleSelect");
    let optionsHtml = '<option value="">-- اختر الصلاحية --</option>';

    availableRoles.forEach((role) => {
      optionsHtml += `<option value="${role.name}">${role.name}</option>`;
    });

    if (addSelect) addSelect.innerHTML = optionsHtml;
    if (assignSelect) assignSelect.innerHTML = optionsHtml;
  }

  // ===== جلب وعرض المستخدمين حسب التبويب =====
  async function loadUsers(page = 1) {
    const loader = document.getElementById("loading-overlay");
    const grid = document.getElementById("users-grid");
    grid.style.display = "none";
    loader.style.display = "block";

    try {
      let url = `${API_BASE}/api/Register?PageNumber=${page}&PageSize=${pageSize}`;

      // إذا كان التبويب ليس "الكل"، نقوم بإرسال الطلب المخصص للفلترة بالدور
      if (currentTab !== "All") {
        url = `${API_BASE}/api/Register/${currentTab}?PageNumber=${page}&PageSize=${pageSize}`;
      }

      const resp = await apiRequest(url);
      allLoadedUsers = resp?.data || [];

      const totalCount = resp?.totalCount || 0;
      const totalPages = Math.ceil(totalCount / pageSize);

      renderUsers();
      renderPager(page, totalPages);
    } catch (err) {
      grid.innerHTML = `<p style="color: var(--danger); font-weight: 700;">تعذر تحميل المستخدمين: ${err.message}</p>`;
    } finally {
      loader.style.display = "none";
      grid.style.display = "grid";
    }
  }

  function renderUsers() {
    const grid = document.getElementById("users-grid");
    grid.innerHTML = "";

    if (allLoadedUsers.length === 0) {
      grid.innerHTML = `<p style="color: #51607a; grid-column: 1 / -1;">لا يوجد مستخدمين لهذه الفئة في هذه الصفحة.</p>`;
      return;
    }

    allLoadedUsers.forEach((user) => {
      let displayName = "غير متوفر";
      let extraInfo = "";

      if (user.patientInfo) {
        displayName = `${user.patientInfo.firstName} ${user.patientInfo.lastName}`;
        extraInfo = `
          <p><i class="fa-solid fa-phone"></i> ${user.patientInfo.phoneNumber || "-"}</p>
          <p><i class="fa-solid fa-location-dot"></i> ${user.patientInfo.address || "-"}</p>
        `;
      } else if (user.doctorInfo) {
        displayName = `د. ${user.doctorInfo.firstName} ${user.doctorInfo.lastName}`;
        extraInfo = `
          <p><i class="fa-solid fa-stethoscope"></i> ${user.doctorInfo.specialty || "-"}</p>
          <p><i class="fa-solid fa-phone"></i> ${user.doctorInfo.phoneNumber || "-"}</p>
        `;
      } else {
        displayName = user.userName.split("@")[0];
        extraInfo = `<p><i class="fa-solid fa-circle-info"></i> لا توجد بيانات إضافية للبروفايل</p>`;
      }

      const roleClass = `role-${user.roleName || "Default"}`;

      // إخفاء زر تعيين الصلاحية للمرضى والأطباء
      const assignRoleBtnHtml =
        user.roleName !== "Patient" && user.roleName !== "Doctor"
          ? `<button class="btn primary small" onclick="openAssignRoleModal('${user.id}', '${user.roleName}')"><i class="fa-solid fa-user-pen"></i> تعيين صلاحية</button>`
          : ``;

      grid.innerHTML += `
        <div class="user-card">
          <div>
            <span class="role-badge ${roleClass}">${user.roleName || "بدون صلاحية"}</span>
            <h3 class="user-name">${displayName}</h3>
            <p class="user-email">${user.email}</p>
            
            <div class="user-info-box">
              ${extraInfo}
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end;">
            ${assignRoleBtnHtml}
          </div>
        </div>
      `;
    });
  }

  // ===== إدارة التبويبات (Tabs) =====
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");

      currentTab = e.target.getAttribute("data-role");
      document.getElementById("currentTabTitle").textContent =
        e.target.textContent + " (الصفحة الحالية)";

      const btnAddUser = document.getElementById("btnAddUser");
      if (currentTab === "Patient") {
        btnAddUser.style.display = "none";
      } else {
        btnAddUser.style.display = "block";
      }

      currentPage = 1;
      loadUsers(currentPage);
    });
  });

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
    loadUsers(newPage);
  };

  // ===== فتح مودال إضافة مستخدم أو طبيب =====
  window.openAddUserModal = function () {
    if (currentTab === "Doctor") {
      // فتح فورم إضافة الطبيب
      document.getElementById("addDoctorForm").reset();
      document.getElementById("addDoctorModal").classList.add("show");
    } else {
      // فتح فورم إضافة الموظف العادي
      document.getElementById("addUserForm").reset();
      const roleSelect = document.getElementById("addRoleSelect");

      if (currentTab !== "All" && currentTab !== "Patient") {
        roleSelect.value = currentTab;
        roleSelect.style.pointerEvents = "none";
        roleSelect.style.backgroundColor = "#e9ecef";
      } else {
        roleSelect.value = "";
        roleSelect.style.pointerEvents = "auto";
        roleSelect.style.backgroundColor = "#fff";
      }
      document.getElementById("addUserModal").classList.add("show");
    }
  };

  // ===== إضافة طبيب جديد (Submit) =====
  document
    .getElementById("addDoctorForm")
    ?.addEventListener("submit", async function (e) {
      e.preventDefault();
      const btnSubmit = document.getElementById("btn-submit-doctor");

      const pwd = document.getElementById("docPassword").value;
      const confirmPwd = document.getElementById("docConfirmPassword").value;
      const phone = document.getElementById("docPhone").value;

      // التحقق من صحة كلمة المرور (6 خانات، حرف كبير، حرف صغير، ورقم على الأقل)
      const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
      if (!pwdRegex.test(pwd)) {
        return showToast(
          "كلمة المرور يجب أن تحتوي على 6 خانات على الأقل، حرف كبير، حرف صغير، ورقم",
          true,
        );
      }

      if (pwd !== confirmPwd) {
        return showToast("كلمات المرور غير متطابقة!", true);
      }

      // التحقق من صحة رقم الهاتف (+249 متبوعة بـ 9 أرقام)
      const phoneRegex = /^\+249\d{9}$/;
      if (!phoneRegex.test(phone)) {
        return showToast("يجب أن يبدأ رقم الهاتف بـ +249 ويليه 9 أرقام", true);
      }

      const payload = {
        firstName: document.getElementById("docFirstName").value.trim(),
        lastName: document.getElementById("docLastName").value.trim(),
        email: document.getElementById("docEmail").value.trim(),
        password: pwd,
        confirmPassword: confirmPwd,
        phoneNumber: phone,
        specialtyID: parseInt(
          document.getElementById("docSpecialty").value,
          10,
        ),
        gender: document.getElementById("docGender").value,
        address: document.getElementById("docAddress").value.trim(),
      };

      btnSubmit.disabled = true;
      btnSubmit.textContent = "جاري الإضافة...";

      try {
        await apiRequest(`${API_BASE}/api/Register/Doctor`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("تمت الإضافة بنجاح و ارسال رابط التاكيد في الايميل");
        closeAllModals();
        loadUsers(currentPage);
      } catch (err) {
        showToast(err.message, true);
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "إضافة طبيب";
      }
    });

  // ===== إضافة موظف جديد عادي (Submit) =====
  document
    .getElementById("addUserForm")
    ?.addEventListener("submit", async function (e) {
      e.preventDefault();
      const btnSubmit = document.getElementById("btn-submit-user");
      const pwd = document.getElementById("addPassword").value;
      const confirmPwd = document.getElementById("addConfirmPassword").value;

      if (pwd !== confirmPwd) {
        return showToast("كلمات المرور غير متطابقة!", true);
      }

      const payload = {
        email: document.getElementById("addEmail").value.trim(),
        password: pwd,
        confirmPassword: confirmPwd,
        roleName: document.getElementById("addRoleSelect").value,
      };

      btnSubmit.disabled = true;
      btnSubmit.textContent = "جاري الإضافة...";

      try {
        await apiRequest(`${API_BASE}/api/Register/AddEmployee`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("تمت الإضافة بنجاح و ارسال رابط التاكيد في الايميل");
        closeAllModals();
        loadUsers(currentPage);
      } catch (err) {
        showToast(err.message, true);
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "إضافة";
      }
    });

  // ===== تعيين صلاحية (Assign Role) =====
  window.openAssignRoleModal = function (userId, currentRole) {
    document.getElementById("assignUserId").value = userId;
    const select = document.getElementById("assignRoleSelect");

    if (currentRole && currentRole !== "null") {
      select.value = currentRole;
    } else {
      select.value = "";
    }

    document.getElementById("assignRoleModal").classList.add("show");
  };

  document
    .getElementById("assignRoleForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();
      const btnSubmit = document.getElementById("btn-submit-assign");
      const payload = {
        userId: document.getElementById("assignUserId").value,
        roleName: document.getElementById("assignRoleSelect").value,
      };

      btnSubmit.disabled = true;
      btnSubmit.textContent = "جاري الحفظ...";

      try {
        await apiRequest(`${API_BASE}/api/Register/assign-role`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("تم تحديث الصلاحية بنجاح!");
        closeAllModals();
        loadUsers(currentPage);
      } catch (err) {
        showToast(err.message, true);
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "حفظ الصلاحية";
      }
    });

  // ===== تغيير كلمة المرور =====
  document
    .getElementById("btn-change-password")
    ?.addEventListener("click", () => {
      document.getElementById("changePassModal").classList.add("show");
      document.getElementById("changePassModalContent").innerHTML = `
    <div style="padding:20px;">
      <h3 style="color:var(--primary); margin-top:0;">تغيير كلمة المرور</h3>
      <form id="passForm" style="display:grid; gap:12px; margin-top:15px;">
        <input type="password" id="currentPassword" placeholder="كلمة المرور الحالية" required class="input">
        <input type="password" id="newPassword" placeholder="كلمة المرور الجديدة" required class="input">
        <input type="password" id="confirmNewPassword" placeholder="تأكيد كلمة المرور الجديدة" required class="input">
        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px;">
          <button type="button" class="btn ghost" onclick="closeAllModals()" style="width:auto;">إلغاء</button>
          <button type="submit" class="btn primary" style="width:auto;">تحديث</button>
        </div>
      </form>
    </div>`;

      document.getElementById("passForm").onsubmit = async (e) => {
        e.preventDefault();
        const cp = document.getElementById("currentPassword").value;
        const np = document.getElementById("newPassword").value;
        const cnp = document.getElementById("confirmNewPassword").value;

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
          showToast("تم تغيير كلمة المرور بنجاح!");
          closeAllModals();
        } catch (err) {
          showToast(err.message, true);
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

  // التشغيل الأولي
  fetchSpecialties(); // جلب التخصصات للفورم
  fetchRoles().then(() => {
    loadUsers(currentPage);
  });
});
