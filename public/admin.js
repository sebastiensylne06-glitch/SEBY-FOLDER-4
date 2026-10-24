
const loginSection = document.getElementById("adminLogin");
const dashboard = document.getElementById("adminDashboard");
const loginForm = document.getElementById("adminLoginForm");
const loginMessage = document.getElementById("adminLoginMessage");
const adminMessage = document.getElementById("adminMessage");
const membersTable = document.getElementById("membersTable");
const memberCount = document.getElementById("adminMemberCount");

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Une erreur est survenue.");
  }

  return data;
}

function addCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = value == null || value === "" ? "—" : String(value);
  row.appendChild(cell);
}

function displayMembers(members) {
  membersTable.replaceChildren();

  if (!members.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = "Aucun membre enregistré.";
    row.appendChild(cell);
    membersTable.appendChild(row);
    return;
  }

  for (const member of members) {
    const row = document.createElement("tr");

    addCell(row, member.id);
    addCell(row, member.name);
    addCell(row, member.country);
    addCell(row, member.phone);
    addCell(row, member.email);
    addCell(row, member.created_at);

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className = "delete-member";
    deleteButton.textContent = "Supprimer";

    deleteButton.addEventListener("click", async () => {
      const confirmed = window.confirm(
        `Voulez-vous vraiment supprimer le compte de ${member.name} ?`
      );

      if (!confirmed) return;

      deleteButton.disabled = true;

      try {
        await api(`/api/admin/members/${member.id}`, {
          method: "DELETE"
        });

        adminMessage.textContent = "Membre supprimé.";
        await loadMembers();
      } catch (error) {
        adminMessage.textContent = error.message;
        deleteButton.disabled = false;
      }
    });

    actionCell.appendChild(deleteButton);
    row.appendChild(actionCell);
    membersTable.appendChild(row);
  }
}

async function loadMembers() {
  adminMessage.textContent = "Chargement des membres...";

  try {
    const [memberData, stats] = await Promise.all([
      api("/api/admin/members"),
      api("/api/admin/stats")
    ]);

    displayMembers(memberData.members);
    memberCount.textContent = Number(stats.total).toLocaleString("fr-FR");
    adminMessage.textContent = "Liste actualisée.";
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

async function checkAdmin() {
  try {
    await api("/api/admin/stats");
    loginSection.hidden = true;
    dashboard.hidden = false;
    await loadMembers();
  } catch {
    loginSection.hidden = false;
    dashboard.hidden = true;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  loginMessage.textContent = "Connexion en cours...";

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("adminEmail").value.trim(),
        password: document.getElementById("adminPassword").value
      })
    });

    loginForm.reset();
    await checkAdmin();
  } catch (error) {
    loginMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("refreshMembers").addEventListener(
  "click",
  loadMembers
);

document.getElementById("adminLogout").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
    dashboard.hidden = true;
    loginSection.hidden = false;
    loginMessage.textContent = "Vous êtes déconnecté.";
  } catch (error) {
    adminMessage.textContent = error.message;
  }
});

checkAdmin();
