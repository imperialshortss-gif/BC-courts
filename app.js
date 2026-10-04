// Supabase setup. The publishable/anon key is safe for browser use; RLS protects the database.
// Do not put the database password or service-role/secret key here.
const SUPABASE_URL = "https://cqqrimemairiwubszzxc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_A8Z7xzw9D2vePpOxXfgiFg_edLDrkzt";
const supabaseConfigured = true;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

function showMessage(id, text, error = false) {
  const el = $(id);
  el.textContent = text;
  el.className = `message ${error ? "error" : "success"}`;
  el.hidden = false;
}

function clearMessage(id) {
  $(id).hidden = true;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function configNotice() {
  if (!supabaseConfigured) showMessage("searchMessage", "The database is not connected yet. The application has been created; the next step is connecting Supabase.", true);
}

async function searchRecord(event) {
  event.preventDefault();
  clearMessage("searchMessage");
  $("recordResult").hidden = true;
  const number = $("recordNumber").value.trim();
  if (!supabaseClient) return configNotice();

  const { data, error } = await supabaseClient.from("records").select("*").eq("record_number", number).maybeSingle();
  if (error) return showMessage("searchMessage", error.message, true);
  if (!data) return showMessage("searchMessage", "No record was found for that record number.", true);

  const file = data.file_url ? `<a class="file-link" href="${escapeHtml(data.file_url)}" target="_blank" rel="noopener">Open details file</a>` : "No file attached.";
  $("recordResult").innerHTML = `
    <div class="result-card">
      <div class="result-title">Record Found</div>
      <dl>
        <div><dt>Record number</dt><dd>${escapeHtml(data.record_number)}</dd></div>
        <div><dt>Name / title</dt><dd>${escapeHtml(data.name || "—")}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(data.status || "—")}</dd></div>
        <div><dt>Date</dt><dd>${formatDate(data.record_date)}</dd></div>
      </dl>
      ${data.description ? `<div class="description"><strong>Details</strong><p>${escapeHtml(data.description).replace(/\n/g, "<br>")}</p></div>` : ""}
      <div class="attachment"><strong>Attached details file</strong><div>${file}</div></div>
    </div>`;
  $("recordResult").hidden = false;
}

async function refreshAuth() {
  if (!supabaseClient) return;
  const { data } = await supabaseClient.auth.getSession();
  const signedIn = !!data.session;
  $("loginPanel").hidden = signedIn;
  $("editorPanel").hidden = !signedIn;
  $("logoutButton").hidden = !signedIn;
}

async function login(event) {
  event.preventDefault();
  clearMessage("loginMessage");
  if (!supabaseClient) return showMessage("loginMessage", "Connect Supabase before signing in.", true);
  const { error } = await supabaseClient.auth.signInWithPassword({ email: $("email").value, password: $("password").value });
  if (error) return showMessage("loginMessage", error.message, true);
  await refreshAuth();
}

async function logout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  await refreshAuth();
}

async function loadExisting(number) {
  if (!supabaseClient || !number) return null;
  const { data, error } = await supabaseClient.from("records").select("*").eq("record_number", number).maybeSingle();
  if (error) throw error;
  if (data) {
    $("editName").value = data.name || "";
    $("editStatus").value = data.status || "";
    $("editDate").value = data.record_date || "";
    $("editDescription").value = data.description || "";
    $("existingFile").innerHTML = data.file_url ? `Current file: <a href="${escapeHtml(data.file_url)}" target="_blank" rel="noopener">Open file</a>` : "No current file.";
  } else {
    $("editName").value = "";
    $("editStatus").value = "";
    $("editDate").value = "";
    $("editDescription").value = "";
    $("existingFile").textContent = "New record — no file yet.";
  }
  return data;
}

async function saveRecord(event) {
  event.preventDefault();
  clearMessage("saveMessage");
  if (!supabaseClient) return showMessage("saveMessage", "Connect Supabase before saving records.", true);
  const recordNumber = $("editRecordNumber").value.trim();
  if (!recordNumber) return showMessage("saveMessage", "Record number is required.", true);

  let existing;
  try { existing = await loadExisting(recordNumber); } catch (e) { return showMessage("saveMessage", e.message, true); }

  let fileUrl = existing?.file_url || null;
  const file = $("detailsFile").files[0];
  if (file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabaseClient.storage.from("record-files").upload(path, file, { upsert: false });
    if (uploadError) return showMessage("saveMessage", uploadError.message, true);
    const { data: publicData } = supabaseClient.storage.from("record-files").getPublicUrl(path);
    fileUrl = publicData.publicUrl;
  }

  const payload = {
    record_number: recordNumber,
    name: $("editName").value.trim() || null,
    status: $("editStatus").value.trim() || null,
    record_date: $("editDate").value || null,
    description: $("editDescription").value.trim() || null,
    file_url: fileUrl
  };

  const { error } = await supabaseClient.from("records").upsert(payload, { onConflict: "record_number" });
  if (error) return showMessage("saveMessage", error.message, true);
  $("detailsFile").value = "";
  await loadExisting(recordNumber);
  showMessage("saveMessage", "Record saved successfully.");
}

$("searchForm").addEventListener("submit", searchRecord);
$("loginForm").addEventListener("submit", login);
$("logoutButton").addEventListener("click", logout);
$("recordForm").addEventListener("submit", saveRecord);
$("adminLink").addEventListener("click", () => {
  $("adminView").hidden = false;
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
});
$("editRecordNumber").addEventListener("blur", async () => {
  if (!supabaseClient) return;
  try { await loadExisting($("editRecordNumber").value.trim()); } catch (e) { showMessage("saveMessage", e.message, true); }
});

if (supabaseClient) supabaseClient.auth.onAuthStateChange(() => refreshAuth());
refreshAuth();
