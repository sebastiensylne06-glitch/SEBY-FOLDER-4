
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "Connexion en cours...";
  loginMessage.textContent = "";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        identifier: loginForm.identifier.value.trim(),
        password: loginForm.password.value
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Connexion impossible.");
    }

    loginMessage.textContent = "Connexion réussie !";

    window.location.href = "/";

  } catch (error) {
    loginMessage.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Se connecter";
  }
});
