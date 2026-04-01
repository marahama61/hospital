/* js/invoices-list.js */
document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "http://smarthospitalapi.somee.com";
  let currentPage = 1;
  const pageSize = 20;

  function formatCurrency(amount) {
    return new Intl.NumberFormat("ar-SD", {
      style: "currency",
      currency: "SDG",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function getStatusBadge(status) {
    switch (status) {
      case "Paid":
        return '<span class="badge success">مدفوعة</span>';
      case "Draft":
        return '<span class="badge warning">مسودة</span>';
      case "Refunded":
        return '<span class="badge danger">مسترجعة</span>';
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

  async function loadInvoices(page = 1) {
    const loader = document.getElementById("loading-overlay");
    const table = document.getElementById("invoices-table");
    const tbody = document.getElementById("invoices-tbody");

    loader.style.display = "block";
    table.style.display = "none";

    try {
      const data = await apiRequest(
        `${API_BASE}/api/Invoice?PageNumber=${page}&PageSize=${pageSize}`,
      );
      tbody.innerHTML = "";

      if (data && data.data && data.data.length > 0) {
        data.data.forEach((inv) => {
          // حساب عدد العناصر داخل الفاتورة للتلخيص
          const itemsCount = inv.items ? inv.items.length : 0;

          tbody.innerHTML += `
            <tr>
              <td><strong>#${inv.id}</strong></td>
              <td>المريض (${inv.patientId})</td>
              <td dir="ltr" style="text-align: right;">${formatCurrency(inv.totalAmount)}</td>
              <td dir="ltr" style="text-align: right; color: #15803d;">${formatCurrency(inv.insuranceCoveredAmount)}</td>
              <td dir="ltr" style="text-align: right; font-weight: 800;">${formatCurrency(inv.amountToPay)}</td>
              <td>${getStatusBadge(inv.invoiceStatus)}</td>
              <td style="color: #51607a; font-size: 12px;">تتضمن ${itemsCount} عنصر(عناصر)</td>
            </tr>
          `;
        });

        const totalPages = Math.ceil(data.totalCount / pageSize);
        renderPager(page, totalPages);
      } else {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">لا توجد فواتير مسجلة</td></tr>`;
        document.getElementById("pager").innerHTML = "";
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">تعذر تحميل البيانات</td></tr>`;
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
    loadInvoices(newPage);
  };

  loadInvoices(currentPage);
});
