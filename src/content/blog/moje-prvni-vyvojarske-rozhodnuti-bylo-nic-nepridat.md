---
title: "Moje první vývojářské rozhodnutí bylo nic nepřidat"
description: "Systém, který jsem postavil na spolupráci Notionu a AI, funguje náhodně. Ne špatně – náhodně. Ukázalo se, že API limit způsobuje, že agent při čtení databáze do"
pubDate: 2026-03-02
category: "Deník experimentu"
draft: false
---

Systém, který jsem postavil na spolupráci Notionu a AI, funguje náhodně. Ne špatně – náhodně. Ukázalo se, že API limit způsobuje, že agent při čtení databáze dostane vždycky jen prvních sto záznamů – a nevím, které to jsou.

Reflexní odpověď byla okamžitá: přejít na Supabase, vektorové vyhledávání, nová vrstva. Dřívější já by to začalo implementovat ještě ten den. Jenže tentokrát jsem se zastavil – a uvědomil, že Supabase by problém jen přesunul. Black Box by se přestěhoval z Notion API do embedding pipeline. Příčina by zůstala beze změny.

Paradox: vývojářský způsob myšlení, na který jsem byl hrdý, se projevil tím, že jsem nic nezačal stavět. Přesně tak.

Fokus zůstane na validitě dat, ne na rozšiřování stacku. To je poprvé, kdy jsem udělal architektonické rozhodnutí místo technologického reflexu.

Petr Mžíček + Claude
