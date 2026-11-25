// Presentation terminology is deliberately separate from the existing Firebase schema.
const MEMBER_NAMES = [
  "Linnéa",
  "Sebastian",
  "Mamma",
  "Pappa",
  "Elsa",
  "Mormor",
  "Andreas",
];
const $ = (id) => document.getElementById(id);
const firebaseConfig = {
  databaseURL:
    "https://familj-wishlist-default-rtdb.europe-west1.firebasedatabase.app",
  apiKey: "AIzaSyDaTQocrksEqv_UCURwefeEw0bvrYEQ8z4",
  authDomain: "familj-wishlist.firebaseapp.com",
  projectId: "familj-wishlist",
  storageBucket: "familj-wishlist.firebasestorage.app",
  messagingSenderId: "349921166344",
  appId: "1:349921166344:web:f8111ed1aaf4f22f6abdbd",
};
let database,
  sdk,
  wishesByPerson = {},
  selected = "",
  editing = null,
  pendingDelete = null;
let ready = false,
  busy = false,
  loadAttempt = 0;

// Keep indexes intact, including sparse legacy Firebase arrays. Never rewrite other members.
function wishArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.slice();
  if (
    typeof value === "object" &&
    Object.keys(value).every((key) => /^\d+$/.test(key))
  ) {
    const array = [];
    for (const [key, item] of Object.entries(value)) array[Number(key)] = item;
    return array;
  }
  throw new Error("Okänt listformat. Inga uppgifter har ändrats.");
}
function wishFingerprint(item) {
  // Firebase omits null object properties; key order is not a data change.
  return JSON.stringify(item, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .filter((key) => value[key] != null)
          .map((key) => [key, value[key]]),
      );
    }
    return value;
  });
}
function safeURL(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function announce(message = "", error = false) {
  $("feedback").textContent = message;
  $("feedback").classList.toggle("error", error);
}
function isPermissionDenied(error) {
  return /permission[\s_-]*denied/i.test(
    `${error.code || ""} ${error.message || ""}`,
  );
}
function setBusy(value) {
  busy = value;
  $("form-fields").disabled = value;
  $("person-select").disabled = value;
  $("show-all").disabled = value;
  $("delete-confirm").disabled = value;
  $("delete-cancel").disabled = value;
  document
    .querySelectorAll(".wish-actions button, .card-footer button")
    .forEach((button) => {
      button.disabled = value;
    });
  $("workspace").setAttribute("aria-busy", String(value));
  $("save-wish").textContent = value
    ? "Sparar…"
    : editing
      ? "Spara ändringar"
      : "Lägg till önskning +";
}
function resetEditor() {
  editing = null;
  $("wish-form").reset();
  $("wish-title").setCustomValidity("");
  $("wish-url").setCustomValidity("");
  $("form-heading").textContent = "Lägg till en önskning";
  $("save-wish").textContent = "Lägg till önskning +";
  $("cancel-edit").hidden = true;
}
function showPerson(name, focus = false) {
  if (busy) return;
  selected = MEMBER_NAMES.includes(name) ? name : "";
  $("person-select").value = selected;
  resetEditor();
  announce();
  render();
  if (focus && ready) $("wish-title").focus();
}
function render() {
  $("workspace").hidden = !ready;
  $("workspace").classList.toggle("selected", Boolean(selected));
  $("editor").hidden = !selected;
  $("show-all").hidden = !selected;
  $("form-person").textContent = selected
    ? `Du skriver i ${selected}s kravlista.`
    : "";
  $("cards").replaceChildren();
  if (!ready) return;
  const total = MEMBER_NAMES.reduce(
    (sum, name) => sum + (wishesByPerson[name] || []).filter(Boolean).length,
    0,
  );
  $("totals").textContent =
    `7 förhandlingsparter · ${total} ${total === 1 ? "önskning" : "önskningar"}`;
  for (const name of selected ? [selected] : MEMBER_NAMES) {
    const wishes = wishesByPerson[name] || [];
    const count = wishes.filter(Boolean).length;
    const card = element("article", "person-card");
    card.dataset.person = name;
    const heading = element("div", "card-heading");
    const initial = element("span", "monogram", name[0]);
    initial.setAttribute("aria-hidden", "true");
    const titleGroup = element("div");
    const title = element("h3", "", name);
    title.id = `member-${MEMBER_NAMES.indexOf(name)}`;
    card.setAttribute("aria-labelledby", title.id);
    titleGroup.append(title, element("p", "", "Förhandlingspart"));
    heading.append(
      initial,
      titleGroup,
      element("span", "wish-count", `${count} krav`),
    );
    card.append(heading);
    if (!count) {
      const empty = element("div", "empty-state");
      empty.append(
        element("strong", "", "Inga önskningar ännu."),
        element(
          "p",
          "",
          "Inga krav har framförts. Förhandlingsläget bedöms som stabilt.",
        ),
      );
      card.append(empty);
    } else {
      const list = element("ul", "wish-list");
      wishes.forEach((item, index) => {
        if (!item) return;
        const li = element("li", "wish-item");
        li.append(
          element("span", "wish-title", item.title || "Önskning utan rubrik"),
        );
        const url = safeURL(item.url);
        if (url) {
          const link = element("a", "wish-link", "Se julklappen ↗");
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.setAttribute(
            "aria-label",
            `Se julklappen: ${item.title || "önskning"} (öppnas i ny flik)`,
          );
          li.append(link);
        }
        if (selected) {
          const actions = element("div", "wish-actions");
          const edit = element("button", "text-button", "Redigera");
          edit.setAttribute(
            "aria-label",
            `Redigera ${item.title || "önskning"}`,
          );
          edit.addEventListener("click", () => {
            if (busy) return;
            editing = { name, index, original: wishFingerprint(item) };
            $("wish-title").value = item.title || "";
            $("wish-url").value = item.url || "";
            $("wish-title").setCustomValidity("");
            $("wish-url").setCustomValidity("");
            $("form-heading").textContent = "Redigera önskning";
            $("save-wish").textContent = "Spara ändringar";
            $("cancel-edit").hidden = false;
            announce();
            $("wish-title").focus();
          });
          const remove = element("button", "text-button remove", "Ta bort");
          remove.setAttribute(
            "aria-label",
            `Ta bort ${item.title || "önskning"}`,
          );
          remove.addEventListener("click", () => {
            if (busy) return;
            pendingDelete = { name, index, original: wishFingerprint(item) };
            $("delete-title").textContent = `”${item.title || "önskningen"}”`;
            $("delete-person").textContent = name;
            $("delete-error").textContent = "";
            $("delete-modal").showModal();
          });
          actions.append(edit, remove);
          li.append(actions);
        }
        list.append(li);
      });
      card.append(list);
    }
    if (!selected) {
      const footer = element("div", "card-footer");
      const open = element("button", "", "Öppna kravlistan");
      open.setAttribute("aria-label", `Öppna ${name}s kravlista`);
      const arrow = element("span", "", "→");
      arrow.setAttribute("aria-hidden", "true");
      open.append(arrow);
      open.addEventListener("click", () => showPerson(name, true));
      footer.append(open);
      card.append(footer);
    }
    $("cards").append(card);
  }
}
async function load() {
  const attempt = ++loadAttempt;
  ready = false;
  $("load-state").hidden = false;
  $("retry").hidden = true;
  $("load-message").textContent = "Kansliet hämtar familjens önskelistor…";
  render();
  // Surface stalled requests without permitting writes against an unloaded list.
  const timer = setTimeout(() => {
    if (attempt !== loadAttempt || ready) return;
    $("load-message").textContent =
      "Det tar längre tid än väntat att hämta listorna. Kontrollera anslutningen eller försök igen.";
    $("retry").hidden = false;
  }, 12000);
  try {
    if (!sdk) {
      const [appModule, databaseModule] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js"),
      ]);
      sdk = databaseModule;
      database = sdk.getDatabase(appModule.initializeApp(firebaseConfig));
    }
    const snapshot = await sdk.get(sdk.ref(database, "wishlists"));
    if (attempt !== loadAttempt) return;
    const data = snapshot.val() || {};
    const loaded = {};
    for (const name of MEMBER_NAMES) loaded[name] = wishArray(data[name]);
    wishesByPerson = loaded;
    ready = true;
    $("load-state").hidden = true;
    render();
  } catch (error) {
    if (attempt !== loadAttempt) return;
    console.error("Kunde inte hämta önskelistorna:", error);
    $("load-message").textContent = isPermissionDenied(error)
      ? "Listorna kunde inte öppnas eftersom tjänsten nekar åtkomst. Sidans ansvarige behöver kontrollera databasens behörigheter. Inga uppgifter har ändrats."
      : "Önskelistorna kunde inte hämtas. Kontrollera internetanslutningen och försök igen. Inga uppgifter har ändrats.";
    $("retry").hidden = false;
  } finally {
    clearTimeout(timer);
  }
}
async function saveChange(name, action, value, target) {
  if (!ready || busy) return false;
  setBusy(true);
  announce();
  const timer = setTimeout(
    () =>
      announce(
        "Sparandet väntar på anslutning till kansliet. Låt sidan vara öppen tills du får en bekräftelse.",
      ),
    12000,
  );
  let stopListening;
  try {
    const personRef = sdk.ref(database, "wishlists/" + name);
    // get() alone does not guarantee a populated transaction cache. Keep a value
    // listener alive until the transaction finishes, and await its initial data.
    await new Promise((resolve, reject) => {
      stopListening = sdk.onValue(personRef, resolve, reject);
    });
    const result = await sdk.runTransaction(
      personRef,
      (current) => {
        const wishes = wishArray(current);
        if (action === "add") wishes.push(value);
        else {
          if (wishFingerprint(wishes[target.index]) !== target.original) return;
          if (action === "edit")
            wishes[target.index] = { ...wishes[target.index], ...value };
          else wishes.splice(target.index, 1);
        }
        return wishes;
      },
      { applyLocally: false },
    );
    if (!result.committed) {
      // An aborted transaction snapshot may contain only local cache data (null).
      // Refresh explicitly; if that fails, leave the currently visible list intact.
      const latest = await sdk.get(personRef);
      wishesByPerson[name] = wishArray(latest.val());
      render();
      throw new Error("conflict");
    }
    wishesByPerson[name] = wishArray(result.snapshot.val());
    render();
    return true;
  } catch (error) {
    console.error("Kunde inte spara önskningen:", error);
    const message =
      error.message === "conflict"
        ? "Listan har ändrats av någon annan. Den senaste versionen visas. Avbryt och öppna önskningen igen innan du ändrar eller tar bort den."
        : "Ändringen kunde inte sparas. Kontrollera internetanslutningen och försök igen. Din inmatning finns kvar.";
    announce(message, true);
    if (pendingDelete) $("delete-error").textContent = message;
    return false;
  } finally {
    stopListening?.();
    clearTimeout(timer);
    setBusy(false);
  }
}
$("wish-title").addEventListener("input", () =>
  $("wish-title").setCustomValidity(""),
);
$("wish-url").addEventListener("input", () =>
  $("wish-url").setCustomValidity(""),
);
$("wish-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selected || !ready || busy) return;
  const title = $("wish-title").value.trim(),
    url = $("wish-url").value.trim();
  $("wish-title").setCustomValidity(title ? "" : "Skriv vad du önskar dig.");
  $("wish-url").setCustomValidity(
    url && !safeURL(url)
      ? "Ange en länk som börjar med https:// eller http://."
      : "",
  );
  if (!$("wish-form").reportValidity()) return;
  const wasEditing = Boolean(editing);
  if (
    await saveChange(
      selected,
      wasEditing ? "edit" : "add",
      { title, url: url || null },
      editing,
    )
  ) {
    resetEditor();
    announce(
      wasEditing
        ? "Ändringen är sparad. Det reviderade kravet har diarieförts."
        : "Önskningen är sparad. Ditt krav har registrerats. Eventuell finansiering är ännu inte säkerställd.",
    );
    $("wish-title").focus();
  }
});
$("person-select").addEventListener("change", (event) =>
  showPerson(event.target.value),
);
$("show-all").addEventListener("click", () => {
  showPerson("");
  $("person-select").focus();
});
$("cancel-edit").addEventListener("click", () => {
  resetEditor();
  $("wish-title").focus();
});
$("retry").addEventListener("click", load);
$("my-list").addEventListener("click", () => {
  if (busy) return;
  $("kravlistor").scrollIntoView();
  if (selected && ready) $("wish-title").focus();
  else $("person-select").focus();
});
$("family-lists").addEventListener("click", () => {
  if (busy) return;
  showPerson("");
  const destination = ready ? $("kravlistor") : $("load-message");
  destination.focus({ preventScroll: true });
  destination.scrollIntoView({ block: ready ? "start" : "center" });
});
$("delete-cancel").addEventListener("click", () => $("delete-modal").close());
$("delete-modal").addEventListener("cancel", (event) => {
  if (busy) event.preventDefault();
});
$("delete-modal").addEventListener("close", () => {
  pendingDelete = null;
});
$("delete-confirm").addEventListener("click", async () => {
  if (!pendingDelete || busy) return;
  const target = pendingDelete;
  if (await saveChange(target.name, "delete", null, target)) {
    resetEditor();
    $("delete-modal").close();
    announce(
      "Önskningen är borttagen. Kravet har dragits tillbaka från förhandlingarna.",
    );
    $("wish-title").focus();
  }
});
load();
