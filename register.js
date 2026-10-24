
const form = document.getElementById("registerForm");
const message = document.getElementById("registerMessage");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";

  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;

  if (password !== confirmPassword) {
    message.textContent = "Les mots de passe ne correspondent pas.";
    return;
  }

  const data = {
    name: form.name.value.trim(),
    country: form.country.value,
    phone: form.phone.value.trim(),
    email: form.email.value.trim(),
    password
  };

  if (!data.phone && !data.email) {
    message.textContent = "Entrez un numéro ou une adresse e-mail.";
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "Inscription en cours...";

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Inscription impossible.");
    }

    message.textContent = "Compte créé avec succès !";
    form.reset();

    setTimeout(() => {
      window.location.href = "/login.html";
    }, 1200);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Créer mon compte";
  }
});
