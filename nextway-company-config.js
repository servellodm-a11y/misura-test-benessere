/* NEXTWAY company configuration.
 * Company-specific data lives here, not in the search engine.
 * Add only facts supported by current official company materials.
 */
(function(){
  const companies={
    zinzino:{
      id:'zinzino',
      name:'Zinzino',
      active:true,
      country:'Italia',
      language:'it',
      sector:['benessere','nutrizione','integrazione alimentare','vendita diretta'],
      positioning:'Progetto commerciale nel settore benessere e nutrizione. Le caratteristiche di prodotti, test e piano compensi devono essere ricavate esclusivamente dalla documentazione ufficiale aggiornata.',
      consultantChannels:{
        generalWellnessWebsite:{
          url:'https://misura-test-benessere.netlify.app',
          label:'Misura Test Benessere',
          role:'sito generale del metodo e del benessere',
          companyBranding:'neutro',
          use:'Primo punto di ingresso per persone interessate a misurazione, consapevolezza e benessere; non presentarlo come sito ufficiale Zinzino.'
        },
        zinzinoReplicaWebsite:{
          url:'https://www.zinzino.com/2017234122',
          label:'Sito replica personale Zinzino',
          role:'approfondimento personale su prodotti e proposta Zinzino',
          companyBranding:'Zinzino',
          use:'Condividerlo quando il contatto ha già manifestato interesse specifico per Zinzino, i suoi prodotti o la collaborazione.'
        }
      },
      searchModifiers:{
        customers:[
          ['omega 3','acidi grassi','benessere personalizzato'],
          ['BalanceTest','test acidi grassi','misurazione'],
          ['integrazione alimentare','omega-3','stile di vita']
        ],
        wellness_pro:[
          ['nutrizione','omega-3','educazione al benessere'],
          ['test acidi grassi','misurazione','consulenza nutrizionale'],
          ['benessere','integrazione alimentare','collaborazione professionale']
        ],
        wellness_networker:[
          ['network marketing wellness','vendita diretta benessere','nutrizione'],
          ['sviluppo team','wellness','integrazione alimentare'],
          ['collaborazione','network marketing','benessere']
        ],
        new_networker:[
          ['iniziare nel network marketing','wellness','formazione'],
          ['nuovo distributore','benessere','vendita diretta'],
          ['primi clienti','nutrizione','supporto commerciale']
        ],
        other_networker:[
          ['network marketing','benessere','nuovi progetti'],
          ['vendita diretta','wellness','collaborazione'],
          ['sviluppo team','nutrizione','business']
        ],
        exnetworker:[
          ['esperienza network marketing','benessere','nuovo progetto'],
          ['vendita diretta','nutrizione','collaborazione'],
          ['nuovo percorso professionale','wellness','formazione']
        ],
        entrepreneur:[
          ['imprenditore','benessere','partnership'],
          ['attività professionale','nutrizione','collaborazione'],
          ['sviluppo commerciale','wellness','nuovo progetto']
        ],
        side_income:[
          ['attività extra','benessere','vendita diretta'],
          ['lavoro part-time','wellness','progetto flessibile'],
          ['seconda attività','nutrizione','formazione']
        ],
        business_seeking:[
          ['attività imprenditoriale','wellness','vendita diretta'],
          ['nuovo progetto','benessere','business'],
          ['attività indipendente','nutrizione','formazione']
        ]
      },
      officialMaterials:{
        productCatalogue:{status:'da_caricare',source:'documentazione ufficiale Zinzino'},
        compensationPlan:{status:'da_caricare',source:'piano compensi ufficiale Zinzino vigente in Italia'},
        productTraining:{status:'da_caricare',source:'materiali ufficiali di formazione prodotto'},
        complianceGuidelines:{status:'da_caricare',source:'policy, claim e linee guida ufficiali'},
        brandPresentation:{status:'da_caricare',source:'presentazione aziendale ufficiale aggiornata'}
      },
      guardrails:[
        'Non inventare prezzi, commissioni, qualifiche, risultati o caratteristiche di prodotto.',
        'Non formulare promesse di reddito o affermazioni mediche.',
        'Distinguere informazioni ufficiali, contenuti pubblici di terzi e ipotesi da verificare.',
        'Non presentare una persona come interessata a una collaborazione senza un segnale pubblico esplicito.',
        'Non confondere il sito generale Misura Test Benessere con il sito ufficiale o replica Zinzino.',
        'Non inserire automaticamente link commerciali in ogni primo messaggio: scegliere il sito in base all’interesse espresso dal contatto.'
      ]
    }
  };
  const active=companies.zinzino;
  window.NEXTWAY_COMPANY_CONFIG={version:1,activeCompanyId:active.id,companies,active};
})();
