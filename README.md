# Regeringsbildning.nu

Familjens befintliga önskelisteapp, omarbetad inför julen 2026. För julfridens skull.

Ingen inloggning. Välj ett namn, lägg till önskningar med valfri produktlänk och läs familjens listor. En vald lista kan redigeras eller få önskningar borttagna efter bekräftelse. Alla som tidigare kunnat läsa och ändra listorna har samma åtkomst; namnvalet ger inget personligt åtkomstskydd.

## Köra lokalt

Appen består av statiska filer och behöver ingen kompilering eller installation av runtime-paket. Starta i projektmappen:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Öppna [appen lokalt](http://127.0.0.1:4173). Öppna via HTTP, inte som `file://`, eftersom appen använder JavaScript-moduler. Internetanslutning behövs till den befintliga Firebase-tjänsten och dess SDK. Lokal normal körning använder samma Firebase som den gamla appen: spara inte testönskningar där.

## Filer och data

- `index.html`: semantiskt gränssnitt och metadata.
- `styles.css`: lokala designtokens och responsiv layout.
- `app.js`: befintlig Firebase-konfiguration och listflöden.
- `favicon.svg`, `chamber.svg`: egna vektorillustrationer.
- `DESIGN.md`: inventering, referenskällor, designbeslut och avgränsningar.
- `tests/browser.cjs`: isolerade webbläsartester.

Firebase-projektet är oförändrat: `familj-wishlist`. Data ligger kvar under `wishlists/{namn}` som arrayer av `{title, url}`. De sju befintliga namnen bevaras. Ingen migration, rensning eller ändring av databasregler ingår. Transaktioner skyddar samtidiga tillägg och avvisar redigering/radering av en önskning som ändrats sedan den visades. Sparfel behåller inmatningen och ger inget felaktigt sparbesked. Osäkra protokoll i produktlänkar aktiveras inte.

## Kontroller

Node.js och Chrome behövs för de automatiska testerna. Testpaketen är endast utvecklingsberoenden:

```powershell
npm ci
npm run check
npm test
```

Alternativt kan testerna köras mot installerad Edge:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm test
```

Tester startar en tillfällig lokal server, ersätter Firebase-modulerna med en isolerad testdubbel och blockerar riktiga databasförfrågningar. Inga tester skriver till familjens Firebase. Testdata finns endast i testkoden och injiceras aldrig i produktionsappen.

Testerna täcker sju listor, tillägg med/utan länk, Enter, redigering, avbruten redigering, bekräftad/avbruten radering, tangentbord i dialog, validering, läs-/skrivfel och återförsök, samtidiga ändringar, osäkra länkar och HTML i text. Layout med långa texter, horisontell overflow och tryckytor kontrolleras vid 320, 375, 390, 430, 768 och 1280 px. Axe kör relevanta automatiska WCAG 2.2 AA-kontroller i översikt, vald lista, tom lista och dialog. Skärmbilder skapas i `test-results/` och är ignorerade av Git.

Tester och visuell granskning i Chrome ersätter inte prov på en fysisk iPhone eller fullständig manuell WCAG-granskning. Inga sådana kontroller har genomförts.

### Integrationstest med den riktiga Firebase-klienten

Raderingsbuggen som rapporterades 2026-11-25 återskapades även med Firebase SDK 11.0.0 mot en lokal Realtime Database-emulator. En engångsläsning med `get()` garanterade inte att transaktionens lokala cache var fylld: den första raderingen kunde avbrytas med ett tomt resultat, vilket appen felaktigt visade som en tom lista. Testerna med en förenklad testdubbel hade inte fångat detta.

Rättningen håller en tillfällig `onValue`-prenumeration öppen under sparandet och inväntar dess första data innan transaktionen startas. Prenumerationen tas bort efteråt. En avbruten transaktion följs av en uttrycklig läsning; om den läsningen misslyckas lämnas den tidigare visade listan kvar. Objekt jämförs utan att egenskapsordning eller Firebase-borttagna `null`-fält ger falska konflikter. [Firebase beskriver lyssnare och transaktioner här](https://firebase.google.com/docs/database/web/read-and-write).

Integrationstestet kräver Java 17 och använder Firebase CLI 13.35.1 som separat testverktyg. Det startar en lokal emulator med **demo-projektet** `demo-wishlist-regression`, laddar den riktiga SDK:n från Googles CDN och kör appen mot testdatabasen. Testservern styr om bara den serverade testkopian av appkoden; produktionsfilen och Firebase-konfigurationen ändras inte. Kör inte kommandot mot ett verkligt projekt-ID.

```powershell
npx --yes --package firebase-tools@13.35.1 firebase emulators:exec --project demo-wishlist-regression --only database --config tests/firebase.json "npm run test:firebase"
```

Verifierat: första raderingen och redigeringen efter en ny sidladdning, ändring/radering direkt efter tillägg utan länk, bevarade extra datafält, en faktisk ändring från en annan klient, radering av sista önskningen, tillägg i en tom lista, oförändrade andra personlistor och bestående resultat efter omladdning. Det vanliga webbläsartestet kontrollerar även att en misslyckad läsning efter en konflikt inte får tömma listan på skärmen. Ingen av dessa tester läser eller skriver till familjens databas.

## Kvarstående kontroll av Firebase

Vid lokal kontroll 2026-11-24 svarade den befintliga databasen med **Permission denied** vid hämtning. Gränssnittet visar därför ett tydligt fel och erbjuder återförsök; inga tomma listor går att spara över de befintliga uppgifterna. Skarpa listor och sparande har inte kunnat verifieras. Testerna av funktionerna är isolerade.

Projektägaren behöver kontrollera befintliga Realtime Database-regler och eventuell App Check-konfiguration samt verifiera avsedd läs- och skrivåtkomst utan inloggning. Denna ändring inför ingen autentisering och ändrar inga säkerhetsinställningar. Ta en export/backup innan framtida ändringar av Firebase-konfigurationen.

Vid fortsatt felsökning samma dag bekräftade projektägaren att de aktiva reglerna är `{"rules":{".read":false,".write":false}}`. Dessa blockerar appens samtliga läsningar och skrivningar. Två fristående, skrivskyddade REST-kontroller mot `wishlists` och `wishlists/Pappa` gav också HTTP 401 med `Permission denied`. Databasadress och sökvägar matchar den tidigare implementationen. Den bekräftade orsaken är alltså nekande databasregler, inte någon nytillkommen inloggning eller den visuella omarbetningen.

`database.rules.example.json` är ett **ej publicerat förslag** som passar det befintliga upplägget utan inloggning. Det tillåter läsning av `wishlists` och skrivning under de sju befintliga personnamnen, medan andra sökvägar förblir låsta. Det innebär offentlig åtkomst: alla som känner till databasadressen kan läsa önskelistorna och ändra eller radera de sju listorna, även utan att gå via webbplatsen. Namnlistan begränsar sökvägar, inte vem som får ändra. Förslaget innehåller ingen ny datavalidering och ska inte beskrivas som familjeexklusiv åtkomst.

För att själv använda förslaget: välj projekt `familj-wishlist` → **Realtime Database** → instansen `familj-wishlist-default-rtdb` → **Rules/Regler**. Spara en kopia av befintliga regler, granska förslaget och publicera reglerna om offentlig åtkomst är avsedd. Detta ändrar åtkomst och raderar inte databasens innehåll. Ladda därefter om appen och verifiera först läsning. Prova skrivning endast med en överenskommen provönskning. Om åtkomst fortfarande nekas efter att reglerna tillåter den, kontrollera [App Check enforcement](https://firebase.google.com/docs/app-check/enable-enforcement); stäng inte av skydd automatiskt. [Firebase beskriver reglernas läs- och skrivbehörigheter här](https://firebase.google.com/docs/database/security).

Gränssnittet skiljer nu mellan nekad åtkomst och anslutningsfel. Knappen **Se familjens önskelistor** flyttar fokus och scrollar till felmeddelandet om listorna inte har kunnat hämtas. Detta kontrolleras i webbläsartestet.

## Inför publicering på regeringsbildning.nu

Ingenting har pushats eller publicerats. DNS, Firebase-regler och den befintliga `CNAME`-filen har inte ändrats.

Efter uttryckligt godkännande:

1. Lös och verifiera Firebase-åtkomsten, först läsning och därefter en överenskommen provändring. Bekräfta att de befintliga listorna visas.
2. Publicera de statiska appfilerna tillsammans: `index.html`, `styles.css`, `app.js`, `favicon.svg`, `chamber.svg`. Behåll Firebase-projektet och databassökvägen.
3. Ställ in `regeringsbildning.nu` som GitHub Pages custom domain och uppdatera `CNAME` i samband med den publiceringen. Befintligt värde är fortfarande `onskningar.se`.
4. Konfigurera nödvändiga DNS-poster enligt GitHub Pages aktuella anvisningar, verifiera domänägande och aktivera HTTPS när certifikatet är klart. Kontrollera eventuell domänbegränsning/App Check i den befintliga Firebase-konfigurationen. Firebase Auth används inte.
5. Prova den nya domänen i mobil och desktop, inklusive läsa, lägga till, redigera och radera en godkänd provönskning. Kontrollera HTTPS, favicon och eventuella önskade omdirigeringar från gamla domäner.

Riksdagens webbplats används endast som [visuell inspirationskälla](https://www.riksdagen.se/sv/). Appen har egen identitet och är ingen officiell politisk tjänst.
