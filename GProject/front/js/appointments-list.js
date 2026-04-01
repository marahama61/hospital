/* js/appointments-list.js */
document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "http://smarthospitalapi.somee.com";
  let currentPage = 1;
  const pageSize = 20;

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString("en-GB")} - ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  }

  function getStatusBadge(status) {
    switch (status) {
      case "Completed":
        return '<span class="badge success">مكتمل</span>';
      case "Cancelled":
        return '<span class="badge danger">ملغي</span>';
      case "Scheduled":
        return '<span class="badge info">مجدول</span>';
      default:
        return `<span class="badge" style="background:#f1f5f9; color:#475569;">${status}</span>`;
    }
  }

  async function apiRequest(url) {
    const fetchFunc = window.authFetch || fetch;
    const resp = await fetchFunc(url, {
      headers: { "Content-Type": "application/json", accept: "*/*" },
    });
    if (!resp.ok) throw new Error(`خطأ: ${resp.status}`);
    return await resp.json();
  }

  async function loadAppointments(page = 1) {
    const loader = document.getElementById("loading-overlay");
    const table = document.getElementById("appointments-table");
    const tbody = document.getElementById("appointments-tbody");

    loader.style.display = "block";
    table.style.display = "none";

    try {
      const data = await apiRequest(
        `${API_BASE}/api/Appointment?PageNumber=${page}&PageSize=${pageSize}`,
      );
      tbody.innerHTML = "";

      if (data && data.data && data.data.length > 0) {
        data.data.forEach((app) => {
          tbody.innerHTML += `
            <tr>
              <td>#${app.id}</td>
              <td><strong>${app.patientName}</strong></td>
              <td>د. ${app.doctorName}</td>
              <td>${app.doctorSpecialization}</td>
              <td dir="ltr" style="text-align: right;">${formatDate(app.appointmentDateTime)}</td>
              <td>${getStatusBadge(app.status)}</td>
            </tr>
          `;
        });

        const totalPages = Math.ceil(data.totalCount / pageSize);
        renderPager(page, totalPages);
      } else {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">لا توجد مواعيد مسجلة</td></tr>`;
        document.getElementById("pager").innerHTML = "";
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">تعذر تحميل البيانات</td></tr>`;
    } finally {
      loader.style.display = "none";
      table.style.display = "table";
    }
  }

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
    loadAppointments(newPage);
  };

  loadAppointments(currentPage);
});
