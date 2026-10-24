
const menuToggle = document.getElementById("menuToggle");
const mainNav = document.getElementById("mainNav");

menuToggle?.addEventListener("click", () => {
  const opened = mainNav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(opened));
});

async function loadMemberCount() {
  const count = document.getElementById("memberCount");
  if (!count) return;

  try {
    const response = await fetch("/api/members/count");
    if (!response.ok) throw new Error("Erreur de chargement");

    const data = await response.json();
    count.textContent = Number(data.total).toLocaleString("fr-FR");
  } catch {
    count.textContent = "—";
  }
}

loadMemberCount();
