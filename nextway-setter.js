(function () {
  'use strict';
  const ENDPOINT = '/functions/v1/nextway-ai-setter';

  function init() {
    if (document.getElementById('nw-setter')) return;
    const cloud = window.NEXTWAY_CLOUD;
    const anchor = document.getElementById('nw-cloud');
    if (!cloud || !anchor) return;

    const panel = document.createElement('section');
    panel.id = 'nw-setter';
    panel.style.cssText = 'max-width:1160px;margin:18px auto;padding:0 18px;font:14px system-ui;color:#172033';
    panel.innerHTML = `
      <style>
        #nw-setter .nwst-box{background:#fff;border:1px solid #dce4ef;border-radius:12px;padding:16px;margin:10px 0}
        #nw-setter .nwst-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        #nw-setter label{display:block;font-weight:650;font-size:13px;margin:8px 0}
        #nw-setter input,#nw-setter select,#nw-setter textarea{display:block;width:100%;padding:10px;border:1px solid #ccd5e2;border-radius:8px;font:inherit;margin-top:4px}
        #nw-setter button{border:0;border-radius:8px;padding:10px 13px;background:#2457d6;color:white;font-weight:700;cursor:pointer;margin:6px 6px 6px 0}
        #nw-setter button.secondary{background:#edf1f8;color:#263650}
        #nw-setter button:disabled{opacity:.55;cursor:not-allowed}
        #nw-setter .nwst-muted{color:#657187;font-size:12px}
        #nw-setter .nwst-status{margin:10px 0;padding:10px;background:#f4f7fb;border-radius:8px;white-space:pre-wrap}
        #nw-setter .nwst-draft{white-space:pre-wrap;overflow-wrap:anywhere;background:#f8faff;border:1px solid #dce4ef;padding:14px;border-radius:8px;min-height:70px}
        @media(max-width:650px){#nw-setter .nwst-grid{grid-template-columns:1fr}}
      </style>
      <div class="nwst-box">
        <h2 style="margin:0 0 6px">NEXTWAY AI Setter</h2>
        <p class="nwst-muted">Crea una scheda prospect e una conversazione, oppure seleziona una conversazione esistente. L'AI prepara una bozza: non invia messaggi.</p>
        <div class="nwst-grid">
          <label>Conversazioni già presenti
            <select id="nwst-conversation"><option value="">Seleziona una conversazione</option></select>
          </label>
          <label>Obiettivo della bozza
            <select id="nwst-goal">
              <option value="first_contact">Primo contatto</option>
              <option value="follow_up">Follow-up</option>
              <option value="reply">Rispondere a un messaggio</option>
              <option value="presentation">Presentare l'opportunità</option>
              <option value="appointment">Proporre un appuntamento</option>
            </select>
          </label>
        </div>
        <button id="nwst-refresh" class="secondary" type="button">Aggiorna conversazioni</button>
        <button id="nwst-generate" type="button">Genera bozza dalla conversazione selezionata</button>
        <hr style="border:0;border-top:1px solid #e5eaf1;margin:16px 0">
        <h3>Nuovo prospect e prima bozza</h3>
        <form id="nwst-create">
          <div class="nwst-grid">
            <label>Nome / identificativo pubblico *
              <input name="display_name" maxlength="120" required>
            </label>
            <label>Categoria *
              <select name="category">
                <option value="potential_partner">Potenziale partner</option>
                <option value="final_customer">Cliente finale</option>
                <option value="wellness_professional">Professionista wellness</option>
              </select>
            </label>
            <label>Fonte / piattaforma *
              <input name="source_name" maxlength="200" placeholder="Es. LinkedIn, Facebook, sito web" required>
            </label>
            <label>URL pubblico verificabile *
              <input name="source_url" type="url" placeholder="https://..." required>
            </label>
          </div>
          <label>Evidenza pubblica e motivo di pertinenza *
            <textarea name="public_evidence" rows="3" maxlength="4000" required></textarea>
          </label>
          <div class="nwst-grid">
            <label>Canale
              <select name="channel">
                <option value="manual">Manuale</option>
                <option value="linkedin">LinkedIn</option>
                <option value="facebook">Facebook</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
            </label>
            <label>Obiettivo della conversazione
              <input name="objective" maxlength="500" value="Valutare il prospect e preparare il primo contatto">
            </label>
          </div>
          <button id="nwst-create-button" type="submit">Crea conversazione e genera bozza</button>
        </form>
        <div id="nwst-status" class="nwst-status" aria-live="polite">In attesa di accesso Supabase.</div>
      </div>
      <div class="nwst-box">
        <h3 style="margin-top:0">Bozza AI generata</h3>
        <div id="nwst-draft" class="nwst-draft">Qui apparirà il testo proposto dall'AI Setter.</div>
        <p id="nwst-meta" class="nwst-muted"></p>
        <button id="nwst-copy" class="secondary" type="button" disabled>Copia bozza</button>
        <p class="nwst-muted">La bozza viene salvata nello storico come non approvata e non inviata. L'invio non è disponibile in questa versione.</p>
      </div>`;
    anchor.insertAdjacentElement('afterend', panel);

    const $ = id => document.getElementById(id);
    const say = message => { $('nwst-status').textContent = message; };
    let lastDraft = '';
    let isGenerating = false;
    let isCreating = false;
    let pendingRequestScope = '';
    let pendingRequestId = '';
    let pendingCreatedConversationId = '';

    function updateCreateButtonLabel() {
      $('nwst-create-button').textContent = pendingCreatedConversationId
        ? 'Riprova generazione sulla conversazione creata'
        : 'Crea conversazione e genera bozza';
    }

    function getIdempotencyKey(conversationId, goal) {
      const scope = 'nextway_setter_idem:' + conversationId + ':' + goal;
      if (pendingRequestScope !== scope) {
        pendingRequestScope = scope;
        pendingRequestId = '';
      }
      if (!pendingRequestId) {
        try { pendingRequestId = sessionStorage.getItem(scope) || ''; } catch (_) {}
      }
      if (!pendingRequestId) {
        pendingRequestId = crypto.randomUUID();
        try { sessionStorage.setItem(scope, pendingRequestId); } catch (_) {}
      }
      return pendingRequestId;
    }

    function clearIdempotencyKey(conversationId, goal) {
      const scope = 'nextway_setter_idem:' + conversationId + ':' + goal;
      try { sessionStorage.removeItem(scope); } catch (_) {}
      if (pendingRequestScope === scope) pendingRequestId = '';
    }

    async function loadConversations() {
      const { c } = await cloud.active();
      const { data, error } = await c.from('nextway_setter_conversations')
        .select('id,lead_id,status,objective,channel')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const select = $('nwst-conversation');
      select.replaceChildren(new Option('Seleziona una conversazione', ''));
      const available = (data || []).filter(row =>
        !['closed', 'archived'].includes(String(row.status || '').toLowerCase())
      );
      available.forEach(row => {
        const label = [row.objective || 'Conversazione', row.channel || 'manual', row.status || '', row.id.slice(0, 8)]
          .filter(Boolean).join(' · ');
        select.add(new Option(label, row.id));
      });
      say(available.length
        ? 'Conversazioni utilizzabili caricate: ' + available.length + '.'
        : 'Nessuna conversazione aperta presente. Puoi crearne una dal modulo qui sotto.');
    }

    async function generateDraft(conversationId, goal) {
      if (!conversationId) throw new Error('Seleziona o crea prima una conversazione.');
      if (isGenerating) return;
      isGenerating = true;
      say('Generazione della bozza in corso…');
      $('nwst-generate').disabled = true;
      $('nwst-create-button').disabled = true;
      try {
        const { s } = await cloud.active();
        const cfg = cloud.getConfig();
        const requestId = getIdempotencyKey(conversationId, goal);
        const response = await fetch(cfg.url + ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + s.access_token,
            'apikey': cfg.key
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            goal: goal,
            request_id: requestId
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.error || ('Errore HTTP ' + response.status));
        clearIdempotencyKey(conversationId, goal);
        lastDraft = payload.message || '';
        $('nwst-draft').textContent = lastDraft;
        $('nwst-meta').textContent = [
          'Strategia: ' + (payload.strategy || '—'),
          'Obiettivo: ' + (payload.objective || '—'),
          'Tono: ' + (payload.tone || '—'),
          'Prossimo passo: ' + (payload.next_step || '—'),
          'Bozza salvata · Non approvata · Non inviata'
        ].join('\n');
        $('nwst-copy').disabled = !lastDraft;
        say('Bozza generata e salvata. Nessun messaggio è stato inviato.');
      } finally {
        isGenerating = false;
        $('nwst-generate').disabled = false;
        $('nwst-create-button').disabled = false;
      }
    }

    $('nwst-refresh').addEventListener('click', async () => {
      try { say('Caricamento conversazioni…'); await loadConversations(); }
      catch (error) { say('Impossibile caricare le conversazioni: ' + error.message); }
    });
    $('nwst-generate').addEventListener('click', async () => {
      try { await generateDraft($('nwst-conversation').value, $('nwst-goal').value); }
      catch (error) { say('Generazione non riuscita: ' + error.message); }
    });
    $('nwst-create').addEventListener('submit', async event => {
      event.preventDefault();
      if (isCreating) return;
      isCreating = true;
      const form = event.currentTarget;
      try {
        if (pendingCreatedConversationId) {
          $('nwst-create-button').disabled = true;
          await loadConversations();
          $('nwst-conversation').value = pendingCreatedConversationId;
          await generateDraft(pendingCreatedConversationId, $('nwst-goal').value);
          pendingCreatedConversationId = '';
          updateCreateButtonLabel();
          return;
        }

        const values = Object.fromEntries(new FormData(form).entries());
        if (!/^https?:\/\//i.test(values.source_url)) {
          say('Inserisci un URL pubblico http o https valido.');
          return;
        }

        const { c } = await cloud.active();
        $('nwst-create-button').disabled = true;
        say('Creazione prospect e conversazione…');
        const { data, error } = await c.rpc('nextway_create_lead_with_conversation', {
          p_display_name: values.display_name.trim(),
          p_category: values.category,
          p_source_name: values.source_name.trim(),
          p_source_url: values.source_url.trim(),
          p_public_evidence: values.public_evidence.trim(),
          p_objective: values.objective.trim() || 'Valutare il prospect e preparare il primo contatto',
          p_channel: values.channel
        });
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        if (!result || !result.success || !result.conversation_id) throw new Error((result && result.error) || 'La RPC non ha restituito un ID conversazione.');

        // Conserva l'ID prima di ogni altra operazione: un errore successivo non deve
        // indurre l'utente a creare un secondo Lead/conversazione al retry.
        pendingCreatedConversationId = result.conversation_id;
        form.reset();
        updateCreateButtonLabel();
        say('Prospect e conversazione creati. Preparazione della bozza…');
        await loadConversations();
        $('nwst-conversation').value = pendingCreatedConversationId;
        await generateDraft(pendingCreatedConversationId, $('nwst-goal').value);
        pendingCreatedConversationId = '';
        updateCreateButtonLabel();
      } catch (error) {
        say(pendingCreatedConversationId
          ? 'Prospect e conversazione sono già stati creati. La bozza non è ancora pronta: premi “Riprova generazione” per riprendere la stessa conversazione, senza creare duplicati. Dettaglio: ' + error.message
          : 'Creazione non riuscita: ' + error.message);
      } finally {
        isCreating = false;
        $('nwst-create-button').disabled = false;
        updateCreateButtonLabel();
      }
    });
    $('nwst-copy').addEventListener('click', async () => {
      if (!lastDraft) return;
      try { await navigator.clipboard.writeText(lastDraft); say('Bozza copiata negli appunti.'); }
      catch (_) { say('Copia automatica non disponibile. Seleziona il testo della bozza e copialo manualmente.'); }
    });

    cloud.active().then(loadConversations).catch(() => {
      say('Accedi dalla sezione Connessione centrale per usare AI Setter.');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();