const SUPABASE_URL = "https://cqqrimemairiwubszzxc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_A8Z7xzw9D2vePpOxXfgiFg_edLDrkzt";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
let staffCredentials = null;

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

async function searchRecord(event) {
  event.preventDefault();
  clearMessage("searchMessage");
  $("recordResult").hidden = true;
  const number = $("recordNumber").value.trim();

  const { data, error } = await supabaseClient
    .from("records")
    .select("id,record_number,name,status,record_date,description,file_name")
    .eq("record_number", number)
    .maybeSingle();

  if (error) return showMessage("searchMessage", error.message, true);
  if (!data) return showMessage("searchMessage", "No record was found for that record number.", true);

  const file = data.file_name
    ? `<button class="file-link" type="button" data-record-file="${escapeHtml(data.record_number)}">Open details file</button>`
    : "No file attached.";

  $("recordResult").innerHTML = `
    <div class="result-card">
      <div class="result-title">Record Found</div>
      <dl>
        <div><dt>Record number</dt><dd>${escapeHtml(data.record_number)}</dd></div>
        <div><dt>Name / title</dt><dd>${escapeHtml(data.name || "—")}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(data.status || "—")}</dd></div>
        <div><dt>Date</dt><dd>${formatDate(data.record_date)}</dd></div>
      </dl>
      ${data.description ? `<div class="description"><strong>Details</strong><p>${escapeHtml(data.description).replace(/\\n/g, "<br>")}</p></div>` : ""}
      <div class="attachment"><strong>Attached details file</strong><div>${file}</div></div>
    </div>`;
  $("recordResult").hidden = false;

  const fileButton = $("recordResult").querySelector("[data-record-file]");
  if (fileButton) fileButton.addEventListener("click", () => openRecordFile(data.record_number));
}

async function openRecordFile(recordNumber) {
  const { data, error } = await supabaseClient.rpc("get_record_file", { p_record_number: recordNumber });
  if (error) return showMessage("searchMessage", error.message, true);
  if (!data?.length || !data[0].file_data) return showMessage("searchMessage", "No attached file is available.", true);

  const hex = String(data[0].file_data).replace(/^\\x/, "");
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((x) => parseInt(x, 16)) || []);
  const blob = new Blob([bytes], { type: data[0].file_mime_type || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function setEditorVisible(signedIn) {
  $("loginPanel").hidden = signedIn;
  $("editorPanel").hidden = !signedIn;
  $("logoutButton").hidden = !signedIn;
}

async function login(event) {
  event.preventDefault();
  clearMessage("loginMessage");

  const username = $("username").value.trim();
  const password = $("password").value;
  if (!username || !password) return showMessage("loginMessage", "Username and password are required.", true);

  const { data, error } = await supabaseClient.rpc("staff_login", {
    p_username: username,
    p_password: password
  });

  if (error) return showMessage("loginMessage", error.message, true);
  if (data !== true) return showMessage("loginMessage", "Invalid username or password.", true);

  staffCredentials = { username, password };
  setEditorVisible(true);
  $("password").value = "";
  showMessage("loginMessage", "Signed in successfully.");
}

function logout() {
  staffCredentials = null;
  $("password").value = "";
  setEditorVisible(false);
}

async function loadExisting(number) {
  if (!number) return null;

  const { data, error } = await supabaseClient
    .from("records")
    .select("id,record_number,name,status,record_date,description,file_name")
    .eq("record_number", number)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    $("editName").value = data.name || "";
    $("editStatus").value = data.status || "";
    $("editDate").value = data.record_date || "";
    $("editDescription").value = data.description || "";
    $("existingFile").textContent = data.file_name ? `Current file: ${data.file_name}` : "No current file.";
  } else {
    $("editName").value = "";
    $("editStatus").value = "";
    $("editDate").value = "";
    $("editDescription").value = "";
    $("existingFile").textContent = "New record — no file yet.";
  }
  return data;
}

function arrayBufferToBytea(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = "\\x";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

async function saveRecord(event) {
  event.preventDefault();
  clearMessage("saveMessage");

  if (!staffCredentials) return showMessage("saveMessage", "Please sign in first.", true);

  const recordNumber = $("editRecordNumber").value.trim();
  if (!recordNumber) return showMessage("saveMessage", "Record number is required.", true);

  let fileName = null;
  let fileMimeType = null;
  let fileData = null;
  const file = $("detailsFile").files[0];

  if (file) {
    if (file.size > 10 * 1024 * 1024) {
      return showMessage("saveMessage", "Please keep the attached file under 10 MB.", true);
    }
    fileName = file.name;
    fileMimeType = file.type || "application/octet-stream";
    fileData = arrayBufferToBytea(await file.arrayBuffer());
  }

  const { error } = await supabaseClient.rpc("save_record", {
    p_username: staffCredentials.username,
    p_password: staffCredentials.password,
    p_record_number: recordNumber,
    p_name: $("editName").value.trim(),
    p_status: $("editStatus").value.trim(),
    p_record_date: $("editDate").value || null,
    p_description: $("editDescription").value.trim(),
    p_file_name: fileName,
    p_file_mime_type: fileMimeType,
    p_file_data: fileData
  });

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
  try {
    await loadExisting($("editRecordNumber").value.trim());
  } catch (e) {
    showMessage("saveMessage", e.message, true);
  }
});

setEditorVisible(false);
