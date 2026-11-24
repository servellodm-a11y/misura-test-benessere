(function () {
  "use strict";

  function init() {
    if (document.getElementById("nw-admin")) return;
    const cloud = window.NEXTWAY_CLOUD;
    if (!cloud) return;

    const $ = (id) => document.getElementById(id);
    const state = { workspaces: [], profiles: [], memberships: [], documents: [], prompts: [], criteria: [], pendingZinzinoSeed: null };
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

    async function fetchWithTimeout(url, options, label) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        return await fetch(url, { ...(options || {}), signal: controller.signal });
      } catch (error) {
        if (error?.name === "AbortError") {
          throw new Error((label || "Richiesta") + " senza risposta entro 30 secondi. Riprova dopo aver verificato la connessione.");
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    async function adminAction(payload) {
      const { c, s: initialSession } = await session();
      const cfg = cloud.getConfig();
      const invoke = async (accessToken) => {
        const response = await fetchWithTimeout(cfg.url + "/functions/v1/nextway-workspace-admin", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + accessToken,
            "apikey": cfg.key
          },
          body: JSON.stringify(payload)
        }, "Operazione amministrativa");
        const result = await response.json().catch(() => ({}));
        return { response, result };
      };

      let accessToken = initialSession?.access_token;
      if (!accessToken) throw new Error("Sessione Supabase assente. Accedi nuovamente.");
      let outcome = await invoke(accessToken);

      // A stale access token can survive in a restored browser tab. Refresh once
      // on 401, then retry with the new user JWT; never substitute a service key.
      if (outcome.response.status === 401) {
        const { data, error } = await c.auth.refreshSession();
        if (error || !data?.session?.access_token) {
          throw new Error("Sessione amministrativa scaduta. Esci e accedi nuovamente a NEXTWAY.");
        }
        outcome = await invoke(data.session.access_token);
      }

      if (!outcome.response.ok || !outcome.result.success) {
        const detail = outcome.result.error ||
          ("Errore HTTP " + outcome.response.status + ". Verifica sessione, ruolo platform_admin e disponibilità della Edge Function.");
        throw new Error(detail);
      }
      return outcome.result;
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
      if (selectedWorkspace()) await loadSelectedWorkspace();
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
        const settings = workspace.settings && typeof workspace.settings === "object" ? workspace.settings : {};
        const offeringCount = Array.isArray(settings.offering) ? settings.offering.length : 0;
        const audienceCount = Array.isArray(settings.audiences) ? settings.audiences.length : 0;
        const keywordCount = settings.discovery && Array.isArray(settings.discovery.keywords) ? settings.discovery.keywords.length : 0;
        if (offeringCount || audienceCount || keywordCount) {
          item.append(node("p", "Profilo commerciale: " + offeringCount + " offerte · " + audienceCount + " pubblici · " + keywordCount + " parole chiave", "muted"));
        }
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
      const workspace = selectedWorkspace();
      const moduleInput = $("knowledge-upload").elements.namedItem("module_key");
      const commercialEditor = $("commercial-config-json");
      const commercialCurrent = $("commercial-config-current");
      if (workspace && moduleInput && !moduleInput.value.trim()) moduleInput.value = workspace.workspace_key.slice(0, 64);
      if (commercialEditor) commercialEditor.value = workspace?.settings?.commercial ? JSON.stringify(workspace.settings.commercial, null, 2) : "";
      if (commercialCurrent) commercialCurrent.textContent = workspace?.settings?.commercial ? "Configurazione commerciale presente · " + workspace.name : (workspace ? "Configurazione commerciale non ancora impostata · " + workspace.name : "Seleziona un workspace.");
      if (!workspace) {
        state.memberships = [];
        state.documents = [];
        state.prompts = [];
        state.criteria = [];
        renderWorkspaceReadiness();
        return;
      }
      await Promise.all([loadMemberships(), loadDocuments(), loadGovernance()]);
      renderWorkspaceReadiness();
    }

    function renderWorkspaceReadiness() {
      const target = $("workspace-readiness");
      if (!target) return;
      target.replaceChildren();
      const workspace = selectedWorkspace();
      if (!workspace) {
        target.textContent = "Seleziona un workspace.";
        return;
      }
      const checks = [];
      checks.push({ label: "Workspace attivo", ok: workspace.status === "active", detail: "Stato: " + workspace.status });
      let commercialOk = false;
      let commercialDetail = "Configurazione commerciale assente.";
      try {
        const normalizer = window.NEXTWAY_WORKSPACE_COMMERCIAL_CONFIG?.normalize;
        if (!normalizer) throw new Error("Validatore non caricato.");
        normalizer({
          commercial_config: workspace.settings?.commercial,
          workspace_key: workspace.workspace_key,
          partner_name: workspace.partner_name,
          workspace_name: workspace.name,
          market_country: workspace.market_country,
          language_code: workspace.language_code
        });
        commercialOk = true;
        commercialDetail = "Configurazione valida: 9 segmenti, criteri e query IT/EN.";
      } catch (error) {
        commercialDetail = error.message;
      }
      checks.push({ label: "Configurazione commerciale", ok: commercialOk, detail: commercialDetail });
      const activeMemberships = state.memberships.filter(item => item.membership_status === "active").length;
      checks.push({ label: "Membri attivi", ok: activeMemberships > 0, detail: activeMemberships + " membership attive." });
      const approvedDocuments = state.documents.filter(item => item.approval_status === "approved").length;
      checks.push({ label: "Knowledge Base", ok: approvedDocuments > 0, optional: true, detail: approvedDocuments + " documenti approvati; requisito consigliato, non blocca la ricerca prospect." });
      const activePrompts = state.prompts.filter(item => item.status === "active").length;
      const activeCriteria = state.criteria.filter(item => item.status === "active").length;
      checks.push({ label: "Istruzioni AI attive", ok: activePrompts > 0, optional: true, detail: activePrompts + " versioni attive." });
      checks.push({ label: "Criteri di qualificazione attivi", ok: activeCriteria > 0, optional: true, detail: activeCriteria + " versioni attive." });
      checks.forEach(check => {
        const line = node("p", undefined, "item");
        line.append(node("strong", (check.ok ? "OK · " : check.optional ? "DA PREPARARE · " : "BLOCCANTE · ") + check.label));
        line.append(node("span", check.detail, "muted"));
        target.append(line);
      });
      const blockers = checks.filter(check => !check.ok && !check.optional);
      const optional = checks.filter(check => !check.ok && check.optional);
      const summary = node("p", blockers.length ? "Ricerca non pronta: " + blockers.length + " prerequisiti bloccanti." : "Prerequisiti essenziali della ricerca soddisfatti. Nessuna attivazione è stata eseguita.");
      summary.style.fontWeight = "700";
      target.prepend(summary);
      if (optional.length) target.append(node("p", "Da completare per una configurazione più completa: " + optional.map(item => item.label).join(", ") + ".", "muted"));
    }

    $("prepare-zinzino-workspace").addEventListener("click", async () => {
      const button = $("prepare-zinzino-workspace");
      const target = $("zinzino-bootstrap-status");
      button.disabled = true;
      try {
        const [settingsResponse, dataResponse] = await Promise.all([
          fetch("/docs/companies/zinzino/workspace-commercial-settings.json", { cache: "no-store" }),
          fetch("/docs/companies/zinzino/commercial-base.v1.json", { cache: "no-store" })
        ]);
        if (!settingsResponse.ok) throw new Error("Modello Zinzino non disponibile (HTTP " + settingsResponse.status + ").");
        if (!dataResponse.ok) throw new Error("Base commerciale Zinzino non disponibile (HTTP " + dataResponse.status + ").");
        const [seed, commercialData] = await Promise.all([settingsResponse.json(), dataResponse.json()]);
        seed.commercial_data = commercialData;
        const normalizer = window.NEXTWAY_WORKSPACE_COMMERCIAL_CONFIG;
        if (!normalizer?.normalize) throw new Error("Validatore commerciale non caricato.");
        normalizer.normalize({
          workspace_key: "zinzino-italia",
          workspace_name: "Zinzino Italia",
          partner_name: "Zinzino",
          market_country: "Italia",
          language_code: "it",
          commercial_config: seed
        });
        const form = $("workspace-create");
        const set = (name, value) => { form.elements.namedItem(name).value = value; };
        set("name", "Zinzino Italia");
        set("workspace_key", "zinzino-italia");
        set("partner_name", "Zinzino");
        set("website_url", "https://www.zinzino.com/site/it/it-it/partnerweb");
        set("sector", "Benessere, nutrizione e vendita diretta");
        set("market_country", "Italia");
        set("language_code", "it");
        set("description", seed.company.positioning);
        set("profile_offering", seed.company.sector.join("\n"));
        set("profile_audiences", Object.keys(seed.search_queries.it).join("\n"));
        set("profile_discovery_terms", seed.brand_terms.join("\n"));
        set("profile_positioning", seed.company.positioning);
        state.pendingZinzinoSeed = seed;
        target.textContent = "Dati Zinzino e base commerciale Cliente/Partner validati e precompilati. Nessun workspace è stato ancora creato.";
      } catch (error) {
        state.pendingZinzinoSeed = null;
        target.textContent = "Preparazione non completata: " + error.message;
      } finally {
        button.disabled = false;
      }
    });

    $("load-zinzino-commercial-seed").addEventListener("click", async () => {
      const target = $("commercial-config-status");
      const button = $("load-zinzino-commercial-seed");
      button.disabled = true;
      try {
        const [settingsResponse, dataResponse] = await Promise.all([
          fetch("/docs/companies/zinzino/workspace-commercial-settings.json", { cache: "no-store" }),
          fetch("/docs/companies/zinzino/commercial-base.v1.json", { cache: "no-store" })
        ]);
        if (!settingsResponse.ok) throw new Error("File seed Zinzino non disponibile (HTTP " + settingsResponse.status + ").");
        if (!dataResponse.ok) throw new Error("Base commerciale Zinzino non disponibile (HTTP " + dataResponse.status + ").");
        const [seed, commercialData] = await Promise.all([settingsResponse.json(), dataResponse.json()]);
        seed.commercial_data = commercialData;
        const normalizer = window.NEXTWAY_WORKSPACE_COMMERCIAL_CONFIG;
        if (!normalizer?.normalize) throw new Error("Validatore della configurazione commerciale non caricato.");
        normalizer.normalize({
          workspace_key: "zinzino-italia",
          workspace_name: "Zinzino Italia",
          commercial_config: seed
        });
        $("commercial-config-json").value = JSON.stringify(seed, null, 2);
        target.textContent = "Modello di ricerca e base commerciale Cliente/Partner caricati. Non sono ancora stati salvati nel workspace.";
      } catch (error) {
        target.textContent = "Caricamento non riuscito: " + error.message;
      } finally {
        button.disabled = false;
      }
    });

    $("save-commercial-config").addEventListener("click", async () => {
      const button = $("save-commercial-config");
      const target = $("commercial-config-status");
      const workspace = selectedWorkspace();
      if (!workspace) { target.textContent = "Seleziona prima un workspace."; return; }
      button.disabled = true;
      try {
        const commercial = JSON.parse($("commercial-config-json").value || "{}");
        const normalizer = window.NEXTWAY_WORKSPACE_COMMERCIAL_CONFIG;
        if (!normalizer?.normalize) throw new Error("Validatore della configurazione commerciale non caricato.");
        const normalized = normalizer.normalize({
          workspace_id: workspace.id,
          workspace_key: workspace.workspace_key,
          workspace_name: workspace.name,
          partner_name: workspace.partner_name,
          market_country: workspace.market_country,
          language_code: workspace.language_code,
          commercial_config: commercial
        });
        const missingSegments = normalizer.segments.filter(segment => !normalized.searchModifiers[segment]?.length);
        if (missingSegments.length) throw new Error("Criteri mancanti per: " + missingSegments.join(", "));
        if (!confirm("Salvare la configurazione commerciale " + normalized.name + " nel workspace " + workspace.name + "?")) return;
        const settings = { ...(workspace.settings || {}), commercial };
        await adminAction({ action: "update_workspace", workspace_id: workspace.id, settings });
        await loadWorkspaces();
        target.textContent = "Configurazione commerciale salvata nel workspace " + workspace.name + (normalized.commercialData ? ". Base Cliente/Partner collegata; le regole saranno disponibili al prossimo caricamento." : ". La base commerciale strutturata non è inclusa.");
        status("Configurazione commerciale aggiornata.");
      } catch (error) {
        target.textContent = "Configurazione non salvata: " + error.message;
        status("Salvataggio configurazione commerciale non completato: " + error.message);
      } finally {
        button.disabled = false;
      }
    });

    $("workspace-create").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form).entries());
      const lines = (value) => String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      values.settings = {
        profile_version: 1,
        offering: lines(values.profile_offering),
        audiences: lines(values.profile_audiences),
        discovery: { keywords: lines(values.profile_discovery_terms) },
        messaging: { approved_positioning: String(values.profile_positioning || "").trim() }
      };
      if (state.pendingZinzinoSeed) {
        if (values.workspace_key !== "zinzino-italia" || values.name !== "Zinzino Italia" ||
            values.market_country !== "Italia" || values.language_code !== "it") {
          status("Identità workspace modificata: prepara nuovamente il modello Zinzino prima della creazione.");
          return;
        }
        const normalizer = window.NEXTWAY_WORKSPACE_COMMERCIAL_CONFIG;
        if (!normalizer?.normalize) {
          status("Validatore commerciale non disponibile: workspace non creato.");
          return;
        }
        normalizer.normalize({
          workspace_key: values.workspace_key,
          workspace_name: values.name,
          partner_name: values.partner_name,
          market_country: values.market_country,
          language_code: values.language_code,
          commercial_config: state.pendingZinzinoSeed
        });
        if (!confirm("Creare Zinzino Italia in stato BOZZA con la configurazione commerciale Cliente/Partner già validata? Il workspace non verrà attivato e i calcoli compensi resteranno disabilitati.")) return;
        values.settings.commercial = state.pendingZinzinoSeed;
      }
      delete values.profile_offering;
      delete values.profile_audiences;
      delete values.profile_discovery_terms;
      delete values.profile_positioning;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const result = await adminAction({ action: "create_workspace", ...values });
        await loadWorkspaces();
        $("selected-workspace").value = result.workspace.id;
        await loadSelectedWorkspace();
        form.reset();
        state.pendingZinzinoSeed = null;
        $("zinzino-bootstrap-status").textContent = "Workspace creato in bozza. Configurazione commerciale già associata; verifica i dati prima di qualsiasi attivazione.";
        status("Workspace creato in bozza. Nessuna attivazione eseguita.");
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


    async function loadGovernance() {
      const workspace = selectedWorkspace();
      const promptsTarget = $("prompt-list");
      const criteriaTarget = $("criteria-list");
      promptsTarget.replaceChildren();
      criteriaTarget.replaceChildren();
      if (!workspace) {
        promptsTarget.append(node("p", "Seleziona un workspace."));
        criteriaTarget.append(node("p", "Seleziona un workspace."));
        return;
      }
      const [prompts, criteria] = await Promise.all([
        adminAction({ action: "list_prompts", workspace_id: workspace.id }),
        adminAction({ action: "list_criteria", workspace_id: workspace.id })
      ]);
      state.prompts = prompts.items || [];
      state.criteria = criteria.items || [];
      renderGovernanceItems(promptsTarget, state.prompts, "prompt");
      renderGovernanceItems(criteriaTarget, state.criteria, "criteria");
      renderWorkspaceReadiness();
      status("Istruzioni AI: " + state.prompts.length + " · Criteri: " + state.criteria.length + ".");
    }

    function renderGovernanceItems(target, items, kind) {
      target.replaceChildren();
      if (!items.length) {
        target.append(node("p", kind === "prompt" ? "Nessuna istruzione AI configurata." : "Nessun criterio di qualificazione configurato."));
        return;
      }
      items.forEach((item) => {
        const isPrompt = kind === "prompt";
        const itemKey = isPrompt ? item.prompt_key : item.criteria_key;
        const heading = node("strong", (isPrompt ? item.purpose : item.name) + " · v" + item.version);
        heading.append(node("span", item.status, "pill"));
        const row = node("div", undefined, "item");
        row.append(heading);
        row.append(node("p", "Chiave: " + itemKey + " · ID: " + item.id, "muted"));
        if (item.description) row.append(node("p", item.description));
        if (isPrompt && item.prompt_body) row.append(node("p", item.prompt_body.slice(0, 700) + (item.prompt_body.length > 700 ? "…" : ""), "muted"));
        if (item.status === "draft") {
          const activate = node("button", "Attiva versione", "btn");
          activate.type = "button";
          activate.addEventListener("click", async () => {
            if (!confirm("Attivare " + itemKey + " versione " + item.version + "? La versione attiva precedente sarà sostituita.")) return;
            activate.disabled = true;
            try {
              await adminAction({ action: isPrompt ? "activate_prompt" : "activate_criteria", item_id: item.id });
              await loadGovernance();
              status("Versione attivata.");
            } catch (error) {
              status("Attivazione non completata: " + error.message);
              activate.disabled = false;
            }
          });
          const archive = node("button", "Archivia bozza", "btn warn");
          archive.type = "button";
          archive.addEventListener("click", async () => {
            if (!confirm("Archiviare questa bozza?")) return;
            archive.disabled = true;
            try {
              await adminAction({ action: isPrompt ? "archive_prompt" : "archive_criteria", item_id: item.id });
              await loadGovernance();
            } catch (error) {
              status("Archiviazione non completata: " + error.message);
              archive.disabled = false;
            }
          });
          row.append(activate, archive);
        }
        target.append(row);
      });
    }

    $("prompt-create").addEventListener("submit", async (event) => {
      event.preventDefault();
      const workspace = selectedWorkspace();
      if (!workspace) { status("Seleziona prima un workspace."); return; }
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form).entries());
      values.version = Number(values.version);
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await adminAction({ action: "save_prompt_draft", workspace_id: workspace.id, ...values });
        form.reset();
        form.elements.namedItem("version").value = "1";
        await loadGovernance();
        status("Bozza istruzione AI salvata. Non è attiva finché non la attivi.");
      } catch (error) {
        status("Bozza istruzione non salvata: " + error.message);
      } finally { button.disabled = false; }
    });

    $("criteria-create").addEventListener("submit", async (event) => {
      event.preventDefault();
      const workspace = selectedWorkspace();
      if (!workspace) { status("Seleziona prima un workspace."); return; }
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form).entries());
      values.version = Number(values.version);
      try {
        values.config = JSON.parse(values.config || "{}");
        if (!values.config || Array.isArray(values.config) || typeof values.config !== "object") throw new Error("La configurazione deve essere un oggetto JSON.");
      } catch (error) { status("Configurazione criteri non valida: " + error.message); return; }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await adminAction({ action: "save_criteria_draft", workspace_id: workspace.id, ...values });
        form.reset();
        form.elements.namedItem("version").value = "1";
        form.elements.namedItem("config").value = "{}";
        await loadGovernance();
        status("Bozza criteri salvata. Non è attiva finché non la attivi.");
      } catch (error) {
        status("Bozza criteri non salvata: " + error.message);
      } finally { button.disabled = false; }
    });

    $("governance-refresh").addEventListener("click", async () => {
      try { await loadGovernance(); } catch (error) { status("Istruzioni e criteri non disponibili: " + error.message); }
    });

    $("documents-refresh").addEventListener("click", async () => {
      try { await loadDocuments(); } catch (error) { status("Elenco documenti non disponibile: " + error.message); }
    });
    $("import-zinzino-knowledge").addEventListener("click", async () => {
      const button = $("import-zinzino-knowledge");
      const target = $("zinzino-knowledge-import-status");
      const workspace = selectedWorkspace();
      if (!workspace || workspace.workspace_key !== "zinzino-italia") {
        target.textContent = "Seleziona il workspace Zinzino Italia prima dell'importazione.";
        return;
      }
      if (workspace.status === "archived") {
        target.textContent = "Il workspace è archiviato: importazione non consentita.";
        return;
      }
      button.disabled = true;
      let processed = 0;
      let duplicates = 0;
      let pending = 0;
      try {
        target.textContent = "Verifica manifest e 7 documenti in corso…";
        const manifestResponse = await fetchWithTimeout("/docs/companies/zinzino/knowledge/import-manifest.v1.json", { cache: "no-store" }, "Manifesto Zinzino");
        if (!manifestResponse.ok) throw new Error("Manifesto di importazione non disponibile (HTTP " + manifestResponse.status + ").");
        const manifest = await manifestResponse.json();
        if (manifest.schema_version !== 1 || manifest.workspace_key !== "zinzino-italia" ||
            !["it", "en"].includes(manifest.language_code) ||
            manifest.import_policy?.approval_status !== "pending" ||
            manifest.import_policy?.deduplicate_by_content_sha256 !== true ||
            !Array.isArray(manifest.documents) || manifest.documents.length !== 7) {
          throw new Error("Manifesto Zinzino non valido o incompleto: attesi esattamente 7 documenti IT/EN.");
        }
        const documents = await Promise.all(manifest.documents.map(async (item) => {
          if (!/^[a-z0-9-]+\.md$/.test(item.file) ||
              !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(item.module_key) ||
              item.source_type !== "training_material" || item.language_code && !["it", "en"].includes(item.language_code) ||
              typeof item.title !== "string" || !item.title.trim() ||
              typeof item.source_reference !== "string" || !/^https:\/\//.test(item.source_reference)) {
            throw new Error("Metadati non validi nel manifesto per " + String(item.file || "documento") + ".");
          }
          const response = await fetchWithTimeout("/docs/companies/zinzino/knowledge/" + item.file, { cache: "no-store" }, "Documento " + item.file);
          if (!response.ok) throw new Error("Documento " + item.file + " non disponibile (HTTP " + response.status + ").");
          const content = await response.text();
          if (!content.trim() || content.length > 500000) throw new Error("Contenuto vuoto o oltre il limite per " + item.file + ".");
          return { ...item, content };
        }));
        if (!confirm("Importare " + documents.length + " documenti nel workspace Zinzino Italia? I nuovi documenti resteranno pending e non saranno consultabili dall'AI fino all'approvazione amministrativa. I duplicati non verranno ricreati.")) return;

        const { c, s: initialSession } = await session();
        const cfg = cloud.getConfig();
        if (!initialSession?.access_token) throw new Error("Sessione amministrativa assente. Accedi nuovamente.");
        let accessToken = initialSession.access_token;
        const ingest = async (payload) => {
          const invoke = async () => fetchWithTimeout(cfg.url + "/functions/v1/nextway-knowledge-ingest", {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + accessToken,
              "apikey": cfg.key,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          }, "Importazione " + payload.title);
          let response = await invoke();
          if (response.status === 401) {
            const { data, error } = await c.auth.refreshSession();
            if (error || !data?.session?.access_token) throw new Error("Sessione amministrativa scaduta. Accedi nuovamente.");
            accessToken = data.session.access_token;
            response = await invoke();
          }
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success) {
            throw new Error(result.error || ("Errore HTTP " + response.status + "."));
          }
          return result;
        };

        for (const item of documents) {
          const result = await ingest({
            workspace_id: workspace.id,
            module_key: item.module_key,
            title: item.title,
            source_type: item.source_type,
            language_code: item.language_code || manifest.language_code,
            source_reference: item.source_reference,
            version_label: item.version_label || null,
            valid_from: item.valid_from || null,
            valid_until: item.valid_until || null,
            content: item.content
          });
          processed += 1;
          if (result.duplicate) duplicates += 1;
          if (result.approval_status === "pending") pending += 1;
          target.textContent = "Importazione in corso: " + processed + "/" + documents.length + " · nuovi pending " + pending + " · duplicati " + duplicates + ".";
        }
        await loadDocuments();
        target.textContent = "Importazione completata: " + processed + " documenti esaminati · nuovi pending " + pending + " · duplicati " + duplicates + ". Nessun documento è stato approvato automaticamente.";
        status("Knowledge Base Zinzino importata in stato di revisione. Verifica i documenti prima di approvarli.");
      } catch (error) {
        try { await loadDocuments(); } catch (_) {}
        target.textContent = "Importazione interrotta dopo " + processed + " documenti · pending " + pending + " · duplicati " + duplicates + ". " + error.message + " Puoi ripetere: i duplicati vengono riconosciuti senza ricrearli.";
        status("Importazione Knowledge non completata integralmente: " + error.message);
      } finally {
        button.disabled = false;
      }
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
        const activeWorkspace = selectedWorkspace();
        if (activeWorkspace) form.elements.namedItem("module_key").value = activeWorkspace.workspace_key.slice(0, 64);
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
          p_module_key: $("knowledge-upload").elements.namedItem("module_key").value.trim() || workspace.workspace_key.slice(0, 64),
          p_language_code: $("knowledge-language").value === "en" ? "en" : "it",
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
        await loadProfiles();
        await loadWorkspaces();
        status("Area amministrativa collegata. Le operazioni vengono autorizzate dal server.");
      } catch (error) {
        status("Accesso o servizio amministrativo non disponibile: " + error.message);
      }
    })();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
