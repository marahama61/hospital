const API = "http://smarthospitalapi.somee.com/api/Register/ConfirmEmail";

async function confirmEmail() {
  const params = new URLSearchParams(window.location.search);

  const userId = params.get("userId");
  const token = params.get("token");

  if (!userId || !token) {
    document.getElementById("status").innerText = "رابط التأكيد غير صحيح";
    return;
  }

  try {
    const response = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: userId,
        token: token,
      }),
    });

    const data = await response.text();

    console.log("Response:", data);

    if (response.ok) {
      document.getElementById("status").innerText =
        "تم تأكيد بريدك الإلكتروني بنجاح";

      document.getElementById("loginLink").style.display = "inline-block";
    } else {
      document.getElementById("status").innerText = "فشل تأكيد البريد";
    }
  } catch (error) {
    console.error(error);
    document.getElementById("status").innerText =
      "حدث خطأ أثناء الاتصال بالخادم";
  }
}

confirmEmail();
