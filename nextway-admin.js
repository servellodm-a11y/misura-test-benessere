(function () {
  "use strict";

  function init() {
    if (document.getElementById("nw-admin")) return;
    const cloud = window.NEXTWAY_CLOUD;
    if (!cloud) return;

    const $ = (id) => document.getElementById(id);
    const state = { workspaces: [], profiles: [], memberships: [], documents: [] };
    const status = (message) => { $("admin-status").textContent = message; };

    function node(tag, text, className) {
      const element = document.createElement(tag);
      if (text !== undefined && text !== null) element.textContent = String(text);
      if (className) element.className = className;
      return element;
    }

    async function session() {
      return cloud.active();
    }

    async function adminAction(payload) {
      const { s } = await session();
      const cfg = cloud.getConfig();
      const response = await fetch(cfg.url + "/functions/v1/nextway-workspace-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + s.access_token,
          "apikey": cfg.key
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || ("Errore HTTP " + response.status + ". Verifica che la Edge Function aggiornata sia pubblicata."));
      }
      return result;
    }

    function selectedWorkspace() {
      const id = $("selected-workspace").value;
      return state.workspaces.find((workspace) => workspace.id === id) || null;
    }

    function renderWorkspaceSelect() {
      const select = $("selected-workspace");
      const previous = select.value;
      select.replaceChildren(new Option("Seleziona workspace", ""));
      state.workspaces.forEach((workspace) => {
        select.add(new Option(workspace.name + " · " + workspace.status, workspace.id));
      });
      if (state.workspaces.some((workspace) => workspace.id === previous)) select.value = previous;
      else {
        const active = state.workspaces.find((workspace) => workspace.status === "active");
        if (active) select.value = active.id;
      }
    }

    async function loadWorkspaces() {
      const result = await adminAction({ action: "list_workspaces" });
      state.workspaces = result.workspaces || [];
      renderWorkspaceSelect();
      renderWorkspaces();
      if (selectedWorkspace()) {
        await loadMemberships();
        await loadDocuments();
      }
      status("Workspace caricati: " + state.workspaces.length + ".");
    }

    function renderWorkspaces() {
      const target = $("workspace-list");
      target.replaceChildren();
      if (!state.workspaces.length) {
        target.append(node("p", "Nessun workspace presente. Crea il primo workspace in bozza."));
        return;
      }
      state.workspaces.forEach((workspace) => {
        const item = node("div", undefined, "item");
        const heading = node("strong", workspace.name);
        heading.append(node("span", workspace.status, "pill"));
        item.append(heading);
        item.append(node("p", "Chiave: " + workspace.workspace_key + " · ID: " + workspace.id, "muted"));
        if (workspace.sector) item.append(node("p", "Settore: " + workspace.sector, "muted"));
        const selectButton = node("button", "Seleziona", "btn alt");
        selectButton.type = "button";
        selectButton.addEventListener("click", async () => {
          $("selected-workspace").value = workspace.id;
          await loadSelectedWorkspace();
        });
        item.append(selectButton);
        if (workspace.status === "draft") {
          const activate = node("button", "Attiva workspace", "btn");
          activate.type = "button";
          activate.addEventListener("click", async () => {
            if (!confirm("Attivare il workspace " + workspace.name + "?")) return;
            activate.disabled = true;
            try {
              await adminAction({ action: "update_workspace", workspace_id: workspace.id, status: "active" });
              await loadWorkspaces();
              status("Workspace attivato.");
            } catch (error) {
              status("Attivazione non completata: " + error.message);
              activate.disabled = false;
            }
          });
          item.append(activate);
        } else if (workspace.status === "active") {
          const archive = node("button", "Archivia", "btn warn");
          archive.type = "button";
          archive.addEventListener("click", async () => {
            if (!confirm("Archiviare il workspace " + workspace.name + "? I membri perderanno l'accesso operativo.")) return;
            archive.disabled = true;
            try {
              await adminAction({ action: "update_workspace", workspace_id: workspace.id, status: "archived" });
              await loadWorkspaces();
              status("Workspace archiviato.");
            } catch (error) {
              status("Archiviazione non completata: " + error.message);
              archive.disabled = false;
            }
          });
          item.append(archive);
        }
        target.append(item);
      });
    }

    async function loadProfiles() {
      const result = await adminAction({ action: "list_profiles" });
      state.profiles = result.profiles || [];
      renderProfiles();
      status("Profili caricati: " + state.profiles.length + " (massimo 500).");
    }

    function renderProfiles() {
      const select = $("member-profile");
      const previous = select.value;
      const filter = $("profile-filter").value.trim().toLocaleLowerCase("it");
      select.replaceChildren(new Option("Seleziona profilo già registrato", ""));
      state.profiles.filter((profile) =>
        (profile.name + " " + profile.id + " " + profile.role).toLocaleLowerCase("it").includes(filter)
      ).forEach((profile) => {
        select.add(new Option(profile.name + " · " + profile.role + " · " + profile.id.slice(0, 8), profile.id));
      });
      if (state.profiles.some((profile) => profile.id === previous)) select.value = previous;
    }

    async function loadMemberships() {
      const workspace = selectedWorkspace();
      const target = $("membership-list");
      target.replaceChildren();
      if (!workspace) {
        target.append(node("p", "Seleziona un workspace."));
        return;
      }
      const result = await adminAction({ action: "list_memberships", workspace_id: workspace.id });
      state.memberships = result.memberships || [];
      const names = new Map(state.profiles.map((profile) => [profile.id, profile.name]));
      if (!state.memberships.length) {
        target.append(node("p", "Nessuna membership registrata."));
        return;
      }
      state.memberships.forEach((membership) => {
        const item = node("div", undefined, "item");
        item.append(node("strong", names.get(membership.user_id) || "Profilo " + membership.user_id));
        item.append(node("p", "Ruolo: " + membership.workspace_role + " · Stato: " + membership.membership_status, "muted"));
        item.append(node("p", "User ID: " + membership.user_id, "muted"));
        if (membership.membership_status !== "suspended") {
          const suspend = node("button", "Sospendi membership", "btn warn");
          suspend.type = "button";
          suspend.addEventListener("click", async () => {
            if (!confirm("Sospendere questa membership? L'accesso al workspace verrà revocato.")) return;
            suspend.disabled = true;
            try {
              await adminAction({
                action: "set_membership",
                workspace_id: workspace.id,
                user_id: membership.user_id,
                workspace_role: membership.workspace_role,
                membership_status: "suspended"
              });
              await loadMemberships();
              status("Membership sospesa.");
            } catch (error) {
              status("Sospensione non completata: " + error.message);
              suspend.disabled = false;
            }
          });
          item.append(suspend);
        }
        target.append(item);
      });
    }

    async function loadDocuments() {
      const workspace = selectedWorkspace();
      const target = $("document-list");
      target.replaceChildren();
      if (!workspace) {
        target.append(node("p", "Seleziona un workspace."));
        return;
      }
      const result = await adminAction({ action: "list_documents", workspace_id: workspace.id });
      state.documents = result.documents || [];
      if (!state.documents.length) {
        target.append(node("p", "Nessun documento caricato."));
        return;
      }
      state.documents.forEach((document) => {
        const item = node("div", undefined, "item");
        const heading = node("strong", document.title);
        heading.append(node("span", document.approval_status, "pill"));
        item.append(heading);
        item.append(node("p", "Modulo: " + document.module_key + " · Tipo: " + document.source_type + " · Versione: " + (document.version_label || "n/d"), "muted"));
        item.append(node("p", "Documento ID: " + document.id, "muted"));
        if (document.rejection_reason) item.append(node("p", "Motivo rifiuto: " + document.rejection_reason, "muted"));
        if (document.approval_status === "pending") {
          const approve = node("button", "Approva", "btn");
          approve.type = "button";
          approve.addEventListener("click", async () => {
            if (!confirm("Approvare il documento " + document.title + "? Sarà disponibile alla ricerca nel workspace.")) return;
            approve.disabled = true;
            try {
              await adminAction({ action: "approve_document", document_id: document.id });
              await loadDocuments();
              status("Documento approvato.");
            } catch (error) {
              status("Approvazione non completata: " + error.message);
              approve.disabled = false;
            }
          });
          const reject = node("button", "Respingi", "btn warn");
          reject.type = "button";
          reject.addEventListener("click", async () => {
            const reason = prompt("Motivo del rifiuto (almeno 5 caratteri):", "");
            if (reason === null) return;
            reject.disabled = true;
            try {
              await adminAction({ action: "reject_document", document_id: document.id, reason });
              await loadDocuments();
              status("Documento respinto.");
            } catch (error) {
              status("Rifiuto non completato: " + error.message);
              reject.disabled = false;
            }
          });
          item.append(approve, reject);
        }
        target.append(item);
      });
    }

    async function loadSelectedWorkspace() {
      await Promise.all([loadMemberships(), loadDocuments()]);
    }

    $("workspace-create").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form).entries());
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const result = await adminAction({ action: "create_workspace", ...values });
        await loadWorkspaces();
        $("selected-workspace").value = result.workspace.id;
        await loadSelectedWorkspace();
        form.reset();
        status("Workspace creato in bozza. Verifica i dati e attivalo quando è pronto.");
      } catch (error) {
        status("Creazione workspace non completata: " + error.message);
      } finally {
        button.disabled = false;
      }
    });

    $("workspace-refresh").addEventListener("click", async () => {
      try { await loadWorkspaces(); } catch (error) { status("Elenco workspace non disponibile: " + error.message); }
    });
    $("profiles-refresh").addEventListener("click", async () => {
      try { await loadProfiles(); } catch (error) { status("Elenco profili non disponibile: " + error.message); }
    });
    $("profile-filter").addEventListener("input", renderProfiles);
    $("selected-workspace").addEventListener("change", async () => {
      try { await loadSelectedWorkspace(); } catch (error) { status("Dati workspace non disponibili: " + error.message); }
    });
    $("membership-save").addEventListener("click", async () => {
      const workspace = selectedWorkspace();
      const userId = $("member-profile").value;
      if (!workspace || !userId) {
        status("Seleziona un workspace e un profilo già registrato.");
        return;
      }
      const button = $("membership-save");
      button.disabled = true;
      try {
        await adminAction({
          action: "set_membership",
          workspace_id: workspace.id,
          user_id: userId,
          workspace_role: $("member-role").value,
          membership_status: $("member-status").value
        });
        await loadMemberships();
        status("Membership salvata. Nessuna email o invito è stato inviato.");
      } catch (error) {
        status("Membership non salvata: " + error.message);
      } finally {
        button.disabled = false;
      }
    });

    $("documents-refresh").addEventListener("click", async () => {
      try { await loadDocuments(); } catch (error) { status("Elenco documenti non disponibile: " + error.message); }
    });
    $("knowledge-upload").addEventListener("submit", async (event) => {
      event.preventDefault();
      const workspace = selectedWorkspace();
      if (!workspace) { status("Seleziona prima un workspace."); return; }
      const form = event.currentTarget;
      const values = new FormData(form);
      const file = values.get("file");
      if (!(file instanceof File) || !file.size) { status("Seleziona un file valido."); return; }
      values.append("workspace_id", workspace.id);
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const { s } = await session();
        const cfg = cloud.getConfig();
        const response = await fetch(cfg.url + "/functions/v1/nextway-knowledge-upload", {
          method: "POST",
          headers: { "Authorization": "Bearer " + s.access_token, "apikey": cfg.key },
          body: values
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || ("Errore HTTP " + response.status + ". Verifica il deploy della funzione."));
        await loadDocuments();
        status(result.duplicate
          ? "Documento già presente: non è stato creato un duplicato."
          : "Documento caricato e indicizzato. Stato pending: richiede approvazione.");
        form.reset();
      } catch (error) {
        status("Caricamento non completato: " + error.message);
      } finally {
        button.disabled = false;
      }
    });

    $("knowledge-search").addEventListener("click", async () => {
      const workspace = selectedWorkspace();
      const query = $("knowledge-query").value.trim();
      if (!workspace || !query) { status("Seleziona un workspace e inserisci una query."); return; }
      const button = $("knowledge-search");
      button.disabled = true;
      try {
        const { c } = await session();
        const { data, error } = await c.rpc("nextway_search_knowledge", {
          p_workspace_id: workspace.id,
          p_query: query,
          p_module_key: $("knowledge-upload").elements.namedItem("module_key").value || "zinzino",
          p_language_code: "it",
          p_limit: 5
        });
        if (error) throw error;
        const target = $("knowledge-results");
        target.replaceChildren();
        const results = data || [];
        if (!results.length) target.append(node("p", "Nessun contenuto approvato trovato per questa query."));
        results.forEach((result) => {
          const item = node("div", undefined, "item");
          item.append(node("strong", result.document_title));
          item.append(node("p", result.content));
          item.append(node("p", "Modulo: " + result.module_key + " · Rilevanza: " + Number(result.relevance || 0).toFixed(3), "muted"));
          target.append(item);
        });
        status("Ricerca completata: " + results.length + " segmenti trovati.");
      } catch (error) {
        status("Ricerca Knowledge Base non riuscita: " + error.message);
      } finally {
        button.disabled = false;
      }
    });

    (async () => {
      try {
        await session();
        await Promise.all([loadWorkspaces(), loadProfiles()]);
        status("Area amministrativa collegata. Le operazioni vengono autorizzate dal server.");
      } catch (error) {
        status("Accesso o servizio amministrativo non disponibile: " + error.message);
      }
    })();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
