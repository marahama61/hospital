/* js/manager-dashboard.js */

document.addEventListener("DOMContentLoaded", () => {
  if (window.AppAuth && typeof window.AppAuth.initAuth === "function") {
    window.AppAuth.initAuth();
  }

  const API_BASE = "http://smarthospitalapi.somee.com";

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

  function formatCurrency(amount) {
    return new Intl.NumberFormat("ar-SD", {
      style: "currency",
      currency: "SDG",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  }
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

  // 1. جلب رصيد المستشفى
  async function fetchHospitalBalance() {
    try {
      const data = await apiRequest(`${API_BASE}/api/Banks/1`);
      const mainAccount = data.find((c) => c.id === 1);
      if (mainAccount) {
        document.getElementById("kpi-hospital-balance").textContent =
          formatCurrency(mainAccount.balance);
      }
    } catch (err) {
      console.error("Error fetching bank balance:", err);
      document.getElementById("kpi-hospital-balance").textContent =
        "تعذر التحميل";
    }
  }

  // 2. جلب بيانات الفواتير + سجل الحركات والاسترداد
  async function fetchFinancialStats() {
    try {
      const data = await apiRequest(
        `${API_BASE}/api/Invoice?PageNumber=1&PageSize=100`,
      );
      let totalRevenue = 0;
      let incomeSources = { Appointment: 0, LabTest: 0, Drug: 0 };
      let recentTransactions = [];

      if (data && data.data) {
        const paidInvoices = data.data.filter(
          (inv) =>
            inv.invoiceStatus === "Paid" || inv.invoiceStatus === "Refunded",
        );

        for (const invoice of paidInvoices) {
          totalRevenue += invoice.totalAmount;
          invoice.items.forEach((item) => {
            incomeSources[item.itemType] =
              (incomeSources[item.itemType] || 0) + item.subtotal;
          });
        }

        document.getElementById("kpi-total-revenue").textContent =
          formatCurrency(totalRevenue);
        renderRevenueChart(incomeSources);

        const latestInvoicesToTrack = paidInvoices.slice(0, 5);
        for (const inv of latestInvoicesToTrack) {
          try {
            const paymentData = await apiRequest(
              `${API_BASE}/api/Payment/Invoice/${inv.id}`,
            );
            if (paymentData && paymentData.data) {
              recentTransactions.push(...paymentData.data);
            }
          } catch (e) {
            console.error("Error fetching payments for invoice", inv.id);
          }
        }

        recentTransactions.sort(
          (a, b) => new Date(b.paymentDate) - new Date(a.paymentDate),
        );
        renderTransactionsTable(recentTransactions);
      }
    } catch (err) {
      console.error("Error fetching invoices:", err);
    }
  }

  function renderTransactionsTable(transactions) {
    const tbody = document.getElementById("refunds-tbody");
    tbody.innerHTML = "";
    if (transactions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">لا توجد حركات مسجلة</td></tr>`;
      return;
    }

    transactions.slice(0, 6).forEach((tx) => {
      const isRefund =
        tx.paidAmount < 0 || tx.transactionNumber.startsWith("REF");
      const amountClass = isRefund ? "text-danger" : "";
      const statusBadge = isRefund
        ? `<span class="badge danger">استرداد</span>`
        : `<span class="badge success">دفع</span>`;

      tbody.innerHTML += `
        <tr>
          <td dir="ltr" style="text-align: right; font-size:12px;">${tx.transactionNumber.split("-")[0]}...</td>
          <td dir="ltr" style="text-align: right;">${formatDate(tx.paymentDate)}</td>
          <td class="${amountClass}" dir="ltr" style="text-align: right;">${formatCurrency(tx.paidAmount)}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    });
  }

  // 3. المواعيد وأداء الأطباء
  async function fetchAppointmentStats() {
    try {
      const countData = await apiRequest(`${API_BASE}/api/Appointment/count`);
      document.getElementById("kpi-total-appointments").textContent =
        countData || 0;

      const data = await apiRequest(
        `${API_BASE}/api/Appointment?PageNumber=1&PageSize=100`,
      );
      let statuses = { Completed: 0, Cancelled: 0, Scheduled: 0 };
      let doctorsMap = {};

      if (data && data.data) {
        data.data.forEach((app) => {
          if (statuses[app.status] !== undefined) statuses[app.status]++;

          if (app.status === "Completed") {
            if (!doctorsMap[app.doctorName]) {
              doctorsMap[app.doctorName] = {
                count: 0,
                spec: app.doctorSpecialization,
              };
            }
            doctorsMap[app.doctorName].count++;
          }
        });
      }

      renderAppointmentsChart(statuses);
      renderTopDoctors(doctorsMap);
    } catch (err) {
      console.error("Error fetching appointments:", err);
    }
  }

  function renderTopDoctors(doctorsMap) {
    const tbody = document.getElementById("top-doctors-tbody");
    const sortedDoctors = Object.entries(doctorsMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    tbody.innerHTML = "";
    if (sortedDoctors.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center;">لا توجد مواعيد مكتملة بعد</td></tr>`;
      return;
    }

    sortedDoctors.forEach((doc) => {
      const doctorName = doc[0];
      const details = doc[1];
      tbody.innerHTML += `
        <tr>
          <td><strong>د. ${doctorName}</strong></td>
          <td>${details.spec}</td>
          <td><span class="badge success">${details.count} مواعيد</span></td>
        </tr>
      `;
    });
  }

  // 4. إحصائيات المعمل
  async function fetchLabStats() {
    try {
      const data = await apiRequest(
        `${API_BASE}/api/TestOrder/Orders?PageNumber=1&PageSize=100`,
      );
      document.getElementById("lab-total-orders").textContent =
        data.totalCount || 0;

      if (data && data.data && data.data.length > 0) {
        let testFreq = {};
        data.data.forEach((order) => {
          testFreq[order.testCatalogId] =
            (testFreq[order.testCatalogId] || 0) + 1;
        });

        let topTestId = Object.keys(testFreq).sort(
          (a, b) => testFreq[b] - testFreq[a],
        )[0];

        if (topTestId) {
          const testDetails = await apiRequest(
            `${API_BASE}/api/TestCatalog/Test/${topTestId}`,
          );
          if (testDetails && testDetails.name) {
            document.getElementById("lab-top-test").textContent =
              testDetails.name;
          }
        }
      } else {
        document.getElementById("lab-top-test").textContent = "لا توجد بيانات";
      }
    } catch (err) {
      console.error("Error fetching lab stats:", err);
      document.getElementById("lab-top-test").textContent = "فشل التحميل";
    }
  }

  // 5. إحصائيات الصيدلية
  async function fetchPharmacyStats() {
    try {
      const data = await apiRequest(
        `${API_BASE}/api/Prescription?PageNumber=1&PageSize=100`,
      );
      document.getElementById("rx-total-orders").textContent =
        data.totalCount || 0;

      if (data && data.data && data.data.length > 0) {
        let drugFreq = {};
        data.data.forEach((rx) => {
          rx.prescriptionItems.forEach((item) => {
            drugFreq[item.drugCatalogId] =
              (drugFreq[item.drugCatalogId] || 0) + 1;
          });
        });

        let topDrugId = Object.keys(drugFreq).sort(
          (a, b) => drugFreq[b] - drugFreq[a],
        )[0];

        if (topDrugId) {
          const drugDetails = await apiRequest(
            `${API_BASE}/api/Prescription/Drug/${topDrugId}`,
          );
          if (drugDetails) {
            document.getElementById("rx-top-drug").textContent =
              drugDetails.tradeName || drugDetails.genericName;
          }
        }
      } else {
        document.getElementById("rx-top-drug").textContent = "لا توجد بيانات";
      }
    } catch (err) {
      console.error("Error fetching pharmacy stats:", err);
      document.getElementById("rx-top-drug").textContent = "فشل التحميل";
    }
  }

  // === دوال رسم الشارتات بـ Animation ناعم و Responsive ===
  function renderAppointmentsChart(statuses) {
    const ctx = document.getElementById("appointmentsChart").getContext("2d");
    new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["مكتملة", "ملغية", "مجدولة"],
        datasets: [
          {
            data: [statuses.Completed, statuses.Cancelled, statuses.Scheduled],
            backgroundColor: ["#198754", "#dc3545", "#0ea5e9"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // مهم عشان يقبل الحجم الثابت الجديد
        animation: {
          duration: 2000,
          easing: "easeOutQuart",
        },
        plugins: {
          legend: { position: "bottom", labels: { font: { family: "Cairo" } } },
        },
      },
    });
  }

  function renderRevenueChart(sources) {
    const ctx = document.getElementById("revenueChart").getContext("2d");
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["الكشفيات", "الفحوصات", "الأدوية"],
        datasets: [
          {
            label: "الإيرادات (SDG)",
            data: [
              sources.Appointment || 0,
              sources.LabTest || 0,
              sources.Drug || 0,
            ],
            backgroundColor: ["#0d6efd", "#f59e0b", "#7e22ce"],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // مهم جداً هنا كمان
        animation: {
          duration: 2000,
          easing: "easeOutQuart",
        },
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { font: { family: "Cairo" } } },
          x: { ticks: { font: { family: "Cairo" } } },
        },
      },
    });
  }

  const accountBtn = document.getElementById("accountSettingsBtn");
  const dropdown = document.getElementById("userDropdown");
  accountBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("show");
  });
  document.addEventListener("click", () => dropdown?.classList.remove("show"));

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
  // التشغيل
  fetchHospitalBalance();
  fetchFinancialStats();
  fetchAppointmentStats();
  fetchLabStats();
  fetchPharmacyStats();
});
